-- ==========================================
-- VIDA+ Migration 005: Admin Audit, Ban, Auto-Staff Communities
-- ==========================================
BEGIN;

-- 1. ADMIN pode ler TODAS as conversas (para auditoria de atendimentos encerrados)
DROP POLICY IF EXISTS "Admin lê todas as conversas" ON public.conversations;
CREATE POLICY "Admin lê todas as conversas"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'administrador'
    )
  );

-- 2. ADMIN pode ler TODAS as mensagens (para auditoria)
DROP POLICY IF EXISTS "Admin lê todas as mensagens" ON public.messages;
CREATE POLICY "Admin lê todas as mensagens"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'administrador'
    )
  );

-- 3. Restringir acesso de participantes a conversas encerradas:
--    Usuários comuns e voluntários NÃO devem acessar conversas com status 'encerrada' ou 'arquivada'
--    A policy existente "Usuário acessa suas próprias conversas" permite qualquer status.
--    Substituímos por uma policy que restringe conversas encerradas.
DROP POLICY IF EXISTS "Usuário acessa suas próprias conversas" ON public.conversations;
CREATE POLICY "Participante acessa conversas não-encerradas"
  ON public.conversations FOR ALL
  USING (
    (auth.uid() = user_id OR auth.uid() = volunteer_id)
    AND status NOT IN ('encerrada', 'arquivada')
  );

-- Participantes podem ler conversas encerradas SOMENTE se forem team_chat
DROP POLICY IF EXISTS "Participante lê team chat encerrado" ON public.conversations;
CREATE POLICY "Participante lê team chat encerrado"
  ON public.conversations FOR SELECT
  USING (
    (auth.uid() = user_id OR auth.uid() = volunteer_id)
    AND is_team_chat = true
  );

-- 4. Mensagens: participantes só acessam mensagens de conversas NÃO encerradas
--    (exceto team chat e admin que já tem policy própria)
DROP POLICY IF EXISTS "Participantes acessam as mensagens da conversa" ON public.messages;
CREATE POLICY "Participantes acessam mensagens de conversas ativas"
  ON public.messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())
        AND (c.status NOT IN ('encerrada', 'arquivada') OR c.is_team_chat = true)
    )
  );

-- 5. Admin lê denúncias (reports) — para o painel de administração
DROP POLICY IF EXISTS "Admin lê todas as denúncias" ON public.reports;
CREATE POLICY "Admin lê todas as denúncias"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
    )
  );

-- 6. Admin pode atualizar denúncias
DROP POLICY IF EXISTS "Admin atualiza denúncias" ON public.reports;
CREATE POLICY "Admin atualiza denúncias"
  ON public.reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
    )
  );

-- 7. Moderador/Admin pode ler membros de qualquer comunidade (para moderação)
DROP POLICY IF EXISTS "Staff lê membros de comunidades" ON public.community_members;
CREATE POLICY "Staff lê membros de comunidades"
  ON public.community_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('moderador', 'administrador')
    )
  );

-- 8. Função para auto-associar moderadores e administradores a todas as comunidades
CREATE OR REPLACE FUNCTION public.ensure_staff_in_all_communities()
RETURNS void AS $$
DECLARE
  staff RECORD;
  comm RECORD;
  existing_alias TEXT;
BEGIN
  FOR staff IN
    SELECT u.id, u.display_name, u.role
    FROM public.users u
    WHERE u.role IN ('moderador', 'administrador')
      AND u.status = 'ativo'
  LOOP
    FOR comm IN
      SELECT c.id FROM public.communities c WHERE c.status = 'ativo'
    LOOP
      SELECT cm.alias INTO existing_alias
      FROM public.community_members cm
      WHERE cm.community_id = comm.id AND cm.user_id = staff.id AND cm.status = 'ativo';

      IF existing_alias IS NULL THEN
        INSERT INTO public.community_members (community_id, user_id, alias, role, status)
        VALUES (
          comm.id,
          staff.id,
          COALESCE(NULLIF(staff.display_name, ''), 'Equipe VIDA+'),
          'membro',
          'ativo'
        )
        ON CONFLICT (community_id, user_id) DO UPDATE SET status = 'ativo';
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Executa a função imediatamente para associar staff existente
SELECT public.ensure_staff_in_all_communities();

COMMIT;
