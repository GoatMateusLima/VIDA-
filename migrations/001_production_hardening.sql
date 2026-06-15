-- VIDA+ production hardening.
-- Execute no SQL Editor do Supabase depois do schema.sql.

BEGIN;

-- Impede mais de um atendimento aberto por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_open_per_user
  ON public.conversations(user_id)
  WHERE status IN ('aguardando', 'ativa', 'sinalizada');

CREATE INDEX IF NOT EXISTS idx_conversations_volunteer_history
  ON public.conversations(volunteer_id, created_at DESC)
  WHERE volunteer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_status
  ON public.notifications(user_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id, created_at DESC);

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_birth_year_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_birth_year_check
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND EXTRACT(YEAR FROM CURRENT_DATE)::int - 13);

ALTER TABLE public.volunteer_profiles
  DROP CONSTRAINT IF EXISTS volunteer_profiles_availability_check;
ALTER TABLE public.volunteer_profiles
  ADD CONSTRAINT volunteer_profiles_availability_check
  CHECK (availability_status IN ('online', 'ocupado', 'offline'));

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check CHECK (type IN ('text', 'system', 'media'));

-- O papel inicial nunca é aceito do metadata enviado pelo cliente.
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
    LEFT(COALESCE(NULLIF(new.raw_user_meta_data->>'display_name', ''), 'Usuário Apoiado'), 100),
    'cadastrado'::public.user_role
  );

  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (new.id, 'Apoiado');
  RETURN new;
END;
$$;

-- Revoga políticas públicas excessivas. O backend usa service_role e ignora RLS.
DROP POLICY IF EXISTS "Permitir leitura de usuários" ON public.users;
CREATE POLICY "Usuário lê o próprio cadastro"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Permitir leitura de perfis" ON public.user_profiles;
CREATE POLICY "Usuário lê o próprio perfil"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Leitura pública de perfis de voluntário" ON public.volunteer_profiles;
CREATE POLICY "Voluntário lê o próprio perfil"
  ON public.volunteer_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Participante visualiza sinalizações"
  ON public.risk_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())
    )
  );

CREATE POLICY "Autor visualiza a própria denúncia"
  ON public.reports FOR SELECT
  USING (reporter_id = auth.uid());

-- Habilita eventos de mensagens para uso futuro, sem conceder leitura além do RLS.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
