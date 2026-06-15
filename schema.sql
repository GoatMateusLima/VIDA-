-- ==========================================
-- SCRIPT DE BANCO DE DADOS - VIDA+
-- Execute este script no SQL Editor do seu projeto Supabase
-- ==========================================

-- 1. ENUMS E TIPOS PERSONALIZADOS
CREATE TYPE user_role AS ENUM ('anonimo', 'cadastrado', 'voluntario', 'moderador', 'administrador');
CREATE TYPE conversation_status AS ENUM ('aguardando', 'ativa', 'sinalizada', 'encerrada', 'arquivada');
CREATE TYPE risk_level AS ENUM ('baixo', 'medio', 'alto', 'imediato');
CREATE TYPE report_status AS ENUM ('pendente', 'em_analise', 'resolvido', 'arquivado');
CREATE TYPE application_status AS ENUM ('pendente', 'aprovada', 'rejeitada');

-- 2. TABELA DE USUÁRIOS (Estende a tabela auth.users do Supabase)
CREATE TABLE public.users (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    display_name VARCHAR(100),
    role user_role DEFAULT 'cadastrado'::user_role,
    status VARCHAR(50) DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security) na tabela users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- O backend usa service_role. Clientes autenticados só acessam o próprio cadastro.
CREATE POLICY "Usuário lê o próprio cadastro" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Permitir atualização pelo próprio usuário ou admin" ON public.users FOR UPDATE USING (auth.uid() = id);

-- 3. PERFIS DE USUÁRIOS
CREATE TABLE public.user_profiles (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
    nickname VARCHAR(50),
    birth_year INT,
    state VARCHAR(2),
    preferences_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_birth_year_check
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND EXTRACT(YEAR FROM CURRENT_DATE)::int - 13);
CREATE POLICY "Usuário lê o próprio perfil" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Permitir modificação do próprio perfil" ON public.user_profiles FOR ALL USING (auth.uid() = user_id);

-- 4. TERMOS E CONSENTIMENTOS (LGPD)
CREATE TABLE public.consents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- Ex: 'termos_de_uso', 'politica_privacidade'
    version VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    ip_hash VARCHAR(64)
);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir inserção e visualização do próprio consentimento" ON public.consents FOR ALL USING (auth.uid() = user_id);

-- 5. CANDIDATURAS DE VOLUNTÁRIOS
CREATE TABLE public.volunteer_applications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    status application_status DEFAULT 'pendente'::application_status,
    motivation TEXT,
    experience TEXT,
    reviewer_id UUID REFERENCES public.users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.volunteer_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir envio de candidatura do próprio usuário" ON public.volunteer_applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Permitir leitura de candidatura pelo próprio usuário" ON public.volunteer_applications FOR SELECT USING (auth.uid() = user_id);

-- 6. PERFIS DOS VOLUNTÁRIOS APROVADOS
CREATE TABLE public.volunteer_profiles (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    availability_status VARCHAR(50) DEFAULT 'offline', -- 'online', 'ocupado', 'offline'
    training_status VARCHAR(50) DEFAULT 'concluido',
    risk_level_allowed risk_level DEFAULT 'baixo'::risk_level,
    total_chats INT DEFAULT 0
);

ALTER TABLE public.volunteer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_profiles ADD CONSTRAINT volunteer_profiles_availability_check
  CHECK (availability_status IN ('online', 'ocupado', 'offline'));
CREATE POLICY "Voluntário lê o próprio perfil" ON public.volunteer_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Atualização do próprio status de voluntário" ON public.volunteer_profiles FOR UPDATE USING (auth.uid() = user_id);

-- 7. CONVERSAS (FILA E SALA DE ATENDIMENTO)
CREATE TABLE public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    volunteer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status conversation_status DEFAULT 'aguardando'::conversation_status,
    priority VARCHAR(20) DEFAULT 'normal',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    closed_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversations_queue ON public.conversations(status, created_at) WHERE status = 'aguardando';
CREATE UNIQUE INDEX uq_conversations_open_per_user ON public.conversations(user_id)
  WHERE status IN ('aguardando', 'ativa', 'sinalizada');
CREATE INDEX idx_conversations_volunteer_history ON public.conversations(volunteer_id, created_at DESC)
  WHERE volunteer_id IS NOT NULL;

CREATE POLICY "Usuário acessa suas próprias conversas" ON public.conversations 
    FOR ALL USING (auth.uid() = user_id OR auth.uid() = volunteer_id);

-- 8. MENSAGENS (Criptografadas no banco)
CREATE TABLE public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
    body_encrypted TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text', 'system', 'media'));
CREATE INDEX idx_messages_timeline ON public.messages(conversation_id, created_at);

CREATE POLICY "Participantes acessam as mensagens da conversa" ON public.messages 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.conversations c 
            WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())
        )
    );

-- 9. SINALIZAÇÃO DE RISCO (Risk Flags)
CREATE TABLE public.risk_flags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES public.users(id) NOT NULL,
    level risk_level DEFAULT 'baixo'::risk_level,
    reason TEXT NOT NULL,
    action_taken TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participante visualiza sinalizações" ON public.risk_flags FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND (c.user_id = auth.uid() OR c.volunteer_id = auth.uid())
    )
);

-- 10. DENÚNCIAS (Reports)
CREATE TABLE public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    target_type VARCHAR(50) NOT NULL, -- 'voluntario', 'usuario', 'mensagem', 'comunidade'
    target_id UUID NOT NULL,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status report_status DEFAULT 'pendente'::report_status,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer usuário logado pode denunciar" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Autor visualiza a própria denúncia" ON public.reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE INDEX idx_reports_status_created ON public.reports(status, created_at DESC);

-- 11. CASOS DE MODERAÇÃO
CREATE TABLE public.moderation_cases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE UNIQUE,
    assigned_to UUID REFERENCES public.users(id),
    status VARCHAR(50) DEFAULT 'aberto',
    decision TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

-- 12. COMUNIDADES (GRUPOS DE APOIO)
CREATE TABLE public.communities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'ativo',
    rules_json JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer um visualiza comunidades ativas" ON public.communities FOR SELECT USING (status = 'ativo');

-- 13. MEMBROS DA COMUNIDADE
CREATE TABLE public.community_members (
    community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'membro',
    status VARCHAR(50) DEFAULT 'ativo',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (community_id, user_id)
);

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros acessam participações" ON public.community_members FOR ALL USING (auth.uid() = user_id);

-- 14. NOTIFICAÇÕES
CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'nao_lida',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Apenas próprio usuário gerencia suas notificações" ON public.notifications FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_notifications_user_status ON public.notifications(user_id, status, sent_at DESC);

-- 15. ASSINATURAS PUSH PWA
CREATE TABLE public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário gerencia sua inscrição PWA" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- 16. LOGS DE AUDITORIA
CREATE TABLE public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- ==========================================
-- TRIGGERS DE INTEGRAÇÃO COM AUTH.USERS DO SUPABASE
-- Cria automaticamente o registro em public.users ao registrar na autenticação
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, display_name, role)
  VALUES (
    new.id,
    LEFT(COALESCE(NULLIF(new.raw_user_meta_data->>'display_name', ''), 'Usuário Apoiado'), 100),
    'cadastrado'::public.user_role
  );
  
  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nickname', 'Apoiado')
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
