-- =============================================================================
-- VIDA+ — SCHEMA COMPLETO E DEFINITIVO
-- Único arquivo para executar no SQL Editor do Supabase.
-- Idempotente: pode ser rodado múltiplas vezes sem erros.
-- Inclui: schema base + migration 001 + migration 002 + migration 003
-- =============================================================================

BEGIN;

-- =============================================================================
-- BLOCO 1 — ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'anonimo', 'cadastrado', 'voluntario', 'moderador', 'administrador'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_status AS ENUM (
    'aguardando', 'ativa', 'sinalizada', 'encerrada', 'arquivada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_level AS ENUM (
    'baixo', 'medio', 'alto', 'imediato'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM (
    'pendente', 'em_analise', 'resolvido', 'arquivado'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM (
    'pendente', 'aprovada', 'rejeitada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- BLOCO 2 — TABELAS
-- =============================================================================

-- 1. USUÁRIOS
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name VARCHAR(100),
  role        public.user_role DEFAULT 'cadastrado'::public.user_role,
  status      VARCHAR(50)  DEFAULT 'ativo',
  created_at  TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL,
  updated_at  TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id          UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  nickname         VARCHAR(50),
  birth_year       INT,
  state            VARCHAR(2),
  preferences_json JSONB       DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_birth_year_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_birth_year_check
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND EXTRACT(YEAR FROM CURRENT_DATE)::int - 13);

-- 3. CONSENTIMENTOS (LGPD)
CREATE TABLE IF NOT EXISTS public.consents (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  type        VARCHAR(100) NOT NULL,
  version     VARCHAR(20)  NOT NULL,
  accepted_at TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_hash     VARCHAR(64)
);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

-- 4. CANDIDATURAS DE VOLUNTÁRIOS
CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id          UUID               DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID               REFERENCES public.users(id) ON DELETE CASCADE,
  status      public.application_status DEFAULT 'pendente'::public.application_status,
  motivation  TEXT,
  experience  TEXT,
  reviewer_id UUID               REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ        DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.volunteer_applications ENABLE ROW LEVEL SECURITY;

-- 5. PERFIS DE VOLUNTÁRIOS APROVADOS
CREATE TABLE IF NOT EXISTS public.volunteer_profiles (
  user_id             UUID             REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  approved_at         TIMESTAMPTZ      DEFAULT timezone('utc', now()) NOT NULL,
  availability_status VARCHAR(50)      DEFAULT 'offline',
  training_status     VARCHAR(50)      DEFAULT 'concluido',
  risk_level_allowed  public.risk_level DEFAULT 'baixo'::public.risk_level,
  total_chats         INT              DEFAULT 0
);
ALTER TABLE public.volunteer_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.volunteer_profiles
  DROP CONSTRAINT IF EXISTS volunteer_profiles_availability_check;
ALTER TABLE public.volunteer_profiles
  ADD CONSTRAINT volunteer_profiles_availability_check
  CHECK (availability_status IN ('online', 'ocupado', 'offline'));

-- 6. CONVERSAS
CREATE TABLE IF NOT EXISTS public.conversations (
  id           UUID                      DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID                      REFERENCES public.users(id) ON DELETE RESTRICT,
  volunteer_id UUID                      REFERENCES public.users(id) ON DELETE SET NULL,
  status       public.conversation_status DEFAULT 'aguardando'::public.conversation_status,
  priority     VARCHAR(20)               DEFAULT 'normal',
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  closed_reason VARCHAR(100),
  created_at   TIMESTAMPTZ               DEFAULT timezone('utc', now()) NOT NULL,
  updated_at   TIMESTAMPTZ               DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 7. MENSAGENS
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID        REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id       UUID        REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
  body_encrypted  TEXT        NOT NULL,
  type            VARCHAR(50) DEFAULT 'text',
  created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  deleted_at      TIMESTAMPTZ
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'system', 'media'));

-- 8. SINALIZAÇÕES DE RISCO
CREATE TABLE IF NOT EXISTS public.risk_flags (
  id              UUID              DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID              REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  created_by      UUID              REFERENCES public.users(id) NOT NULL,
  level           public.risk_level DEFAULT 'baixo'::public.risk_level,
  reason          TEXT              NOT NULL,
  action_taken    TEXT,
  created_at      TIMESTAMPTZ       DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;

-- 9. DENÚNCIAS
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID                  DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID                  REFERENCES public.users(id) ON DELETE SET NULL,
  target_type VARCHAR(50)           NOT NULL,
  target_id   UUID                  NOT NULL,
  reason      VARCHAR(100)          NOT NULL,
  description TEXT,
  status      public.report_status  DEFAULT 'pendente'::public.report_status,
  created_at  TIMESTAMPTZ           DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 10. CASOS DE MODERAÇÃO
CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id   UUID        REFERENCES public.reports(id) ON DELETE CASCADE UNIQUE,
  assigned_to UUID        REFERENCES public.users(id),
  status      VARCHAR(50) DEFAULT 'aberto',
  decision    TEXT,
  resolved_at TIMESTAMPTZ
);
ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

-- 11. COMUNIDADES
CREATE TABLE IF NOT EXISTS public.communities (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  status      VARCHAR(50)  DEFAULT 'ativo',
  rules_json  JSONB        DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- 12. MEMBROS DA COMUNIDADE
CREATE TABLE IF NOT EXISTS public.community_members (
  community_id UUID        REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  role         VARCHAR(50) DEFAULT 'membro',
  status       VARCHAR(50) DEFAULT 'ativo',
  joined_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- alias — adicionado pela migration 002 (idempotente)
ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS alias VARCHAR(80);

UPDATE public.community_members
SET alias = 'Membro ' || UPPER(SUBSTRING(user_id::text, 1, 4))
WHERE alias IS NULL;

-- Torna NOT NULL apenas se todos os registros já tiverem valor
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'community_members'
      AND column_name  = 'alias'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.community_members ALTER COLUMN alias SET NOT NULL;
  END IF;
END $$;

-- 13. MENSAGENS DE COMUNIDADE
CREATE TABLE IF NOT EXISTS public.community_messages (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id   UUID        REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  sender_id      UUID        REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
  alias_snapshot VARCHAR(80) NOT NULL,
  body_encrypted TEXT        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  edited_at      TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ
);
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Bloqueia leitura direta pela chave pública — passa só pela API (service_role)
REVOKE ALL ON TABLE public.community_messages FROM anon, authenticated;

-- 14. NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS public.notifications (
  id      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID        REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type    VARCHAR(50) NOT NULL,
  title   VARCHAR(150) NOT NULL,
  body    TEXT         NOT NULL,
  status  VARCHAR(50)  DEFAULT 'nao_lida',
  sent_at TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL,
  -- read_at: campo esperado pelo frontend (migration 003)
  read_at TIMESTAMPTZ
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Garante a coluna em bancos que já tinham a tabela sem read_at
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Sincroniza leituras antigas
UPDATE public.notifications
SET read_at = sent_at
WHERE status = 'lida' AND read_at IS NULL;

-- 15. ASSINATURAS PUSH PWA
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  keys_json  JSONB       NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 16. LOGS DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id      UUID,
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(100) NOT NULL,
  entity_id     UUID,
  metadata_json JSONB        DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- BLOCO 3 — ÍNDICES (todos IF NOT EXISTS)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_open_per_user
  ON public.conversations(user_id)
  WHERE status IN ('aguardando', 'ativa', 'sinalizada');

CREATE INDEX IF NOT EXISTS idx_conversations_queue
  ON public.conversations(status, created_at)
  WHERE status = 'aguardando';

CREATE INDEX IF NOT EXISTS idx_conversations_volunteer_history
  ON public.conversations(volunteer_id, created_at DESC)
  WHERE volunteer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_timeline
  ON public.messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_status
  ON public.notifications(user_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_messages_timeline
  ON public.community_messages(community_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- BLOCO 4 — POLÍTICAS RLS (DROP IF EXISTS + CREATE para idempotência)
-- =============================================================================

-- users
DROP POLICY IF EXISTS "Usuário lê o próprio cadastro"                    ON public.users;
DROP POLICY IF EXISTS "Usuario le o proprio cadastro"                     ON public.users;
DROP POLICY IF EXISTS "Permitir leitura de usuarios"                      ON public.users;
DROP POLICY IF EXISTS "Permitir atualização pelo próprio usuário ou admin" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE USING (auth.uid() = id);

-- user_profiles
DROP POLICY IF EXISTS "Usuário lê o próprio perfil"          ON public.user_profiles;
DROP POLICY IF EXISTS "Usuario le o proprio perfil"           ON public.user_profiles;
DROP POLICY IF EXISTS "Permitir leitura de perfis"            ON public.user_profiles;
DROP POLICY IF EXISTS "Permitir modificação do próprio perfil" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_profiles_all_own"
  ON public.user_profiles FOR ALL USING (auth.uid() = user_id);

-- consents
DROP POLICY IF EXISTS "Permitir inserção e visualização do próprio consentimento" ON public.consents;
CREATE POLICY "consents_all_own"
  ON public.consents FOR ALL USING (auth.uid() = user_id);

-- volunteer_applications
DROP POLICY IF EXISTS "Permitir envio de candidatura do próprio usuário"  ON public.volunteer_applications;
DROP POLICY IF EXISTS "Permitir leitura de candidatura pelo próprio usuário" ON public.volunteer_applications;
CREATE POLICY "volunteer_applications_insert_own"
  ON public.volunteer_applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "volunteer_applications_select_own"
  ON public.volunteer_applications FOR SELECT USING (auth.uid() = user_id);

-- volunteer_profiles
DROP POLICY IF EXISTS "Voluntário lê o próprio perfil"              ON public.volunteer_profiles;
DROP POLICY IF EXISTS "Voluntario le o proprio perfil"               ON public.volunteer_profiles;
DROP POLICY IF EXISTS "Leitura publica de perfis de voluntario"      ON public.volunteer_profiles;
DROP POLICY IF EXISTS "Atualização do próprio status de voluntário"  ON public.volunteer_profiles;
CREATE POLICY "volunteer_profiles_select_own"
  ON public.volunteer_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "volunteer_profiles_update_own"
  ON public.volunteer_profiles FOR UPDATE USING (auth.uid() = user_id);

-- conversations
DROP POLICY IF EXISTS "Usuário acessa suas próprias conversas" ON public.conversations;
CREATE POLICY "conversations_all_participants"
  ON public.conversations FOR ALL
  USING (auth.uid() = user_id OR auth.uid() = volunteer_id);

-- messages
DROP POLICY IF EXISTS "Participantes acessam as mensagens da conversa" ON public.messages;
CREATE POLICY "messages_all_participants"
  ON public.messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())
    )
  );

-- risk_flags
DROP POLICY IF EXISTS "Participante visualiza sinalizações"    ON public.risk_flags;
DROP POLICY IF EXISTS "Participante visualiza sinalizacoes"    ON public.risk_flags;
CREATE POLICY "risk_flags_select_participants"
  ON public.risk_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())
    )
  );

-- reports
DROP POLICY IF EXISTS "Qualquer usuário logado pode denunciar"  ON public.reports;
DROP POLICY IF EXISTS "Autor visualiza a própria denúncia"      ON public.reports;
DROP POLICY IF EXISTS "Autor visualiza a propria denuncia"      ON public.reports;
CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports_select_own"
  ON public.reports FOR SELECT USING (auth.uid() = reporter_id);

-- moderation_cases — sem política pública (só service_role acessa)

-- communities
DROP POLICY IF EXISTS "Qualquer um visualiza comunidades ativas" ON public.communities;
CREATE POLICY "communities_select_active"
  ON public.communities FOR SELECT USING (status = 'ativo');

-- community_members
DROP POLICY IF EXISTS "Membros acessam participações" ON public.community_members;
CREATE POLICY "community_members_all_own"
  ON public.community_members FOR ALL USING (auth.uid() = user_id);

-- community_messages
DROP POLICY IF EXISTS "Membros leem mensagens do grupo"   ON public.community_messages;
DROP POLICY IF EXISTS "Membros enviam mensagens ao grupo" ON public.community_messages;
CREATE POLICY "community_messages_select_members"
  ON public.community_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members m
      WHERE m.community_id = community_messages.community_id
        AND m.user_id = auth.uid()
        AND m.status = 'ativo'
    )
  );
CREATE POLICY "community_messages_insert_members"
  ON public.community_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_members m
      WHERE m.community_id = community_messages.community_id
        AND m.user_id = auth.uid()
        AND m.status = 'ativo'
    )
  );

-- notifications
DROP POLICY IF EXISTS "Apenas próprio usuário gerencia suas notificações" ON public.notifications;
CREATE POLICY "notifications_all_own"
  ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "Usuário gerencia sua inscrição PWA" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_all_own"
  ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- BLOCO 5 — TRIGGER: criação automática de usuário ao registrar no Auth
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, display_name, role)
  VALUES (
    new.id,
    LEFT(COALESCE(NULLIF(new.raw_user_meta_data->>'display_name', ''), 'Usuario Apoiado'), 100),
    'cadastrado'::public.user_role
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (new.id, 'Apoiado')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- BLOCO 6 — REALTIME (idempotente)
-- =============================================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- BLOCO 7 — DADOS INICIAIS (comunidades — só insere se não existir nada)
-- =============================================================================

INSERT INTO public.communities (name, description, rules_json)
SELECT * FROM (VALUES
  (
    'Conversas leves',
    'Um espaco para conversar sobre o dia e encontrar companhia.',
    '["Respeite o tempo de cada pessoa","Nao compartilhe dados pessoais","Sem diagnosticos ou prescricoes"]'::jsonb
  ),
  (
    'Ansiedade e rotina',
    'Trocas acolhedoras sobre ansiedade, habitos e pequenos passos.',
    '["Fale a partir da propria experiencia","Evite gatilhos explicitos","Procure ajuda profissional quando necessario"]'::jsonb
  ),
  (
    'Luto e saudade',
    'Um grupo cuidadoso para quem esta atravessando perdas.',
    '["Acolha sem comparar dores","Nao pressione ninguem a responder","Use aviso antes de conteudo sensivel"]'::jsonb
  )
) AS seed(name, description, rules_json)
WHERE NOT EXISTS (SELECT 1 FROM public.communities LIMIT 1);

-- =============================================================================
-- FIM
-- =============================================================================

COMMIT;
