BEGIN;

ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS alias VARCHAR(80);

UPDATE public.community_members
SET alias = 'Membro ' || UPPER(SUBSTRING(user_id::text, 1, 4))
WHERE alias IS NULL;

ALTER TABLE public.community_members
  ALTER COLUMN alias SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.community_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
  alias_snapshot VARCHAR(80) NOT NULL,
  body_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_community_messages_timeline
  ON public.community_messages(community_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Mensagens passam exclusivamente pela API. Isso impede que uma chave publica
-- do Supabase leia sender_id ou o conteudo criptografado diretamente.
REVOKE ALL ON TABLE public.community_messages FROM anon, authenticated;

DROP POLICY IF EXISTS "Membros leem mensagens do grupo" ON public.community_messages;
CREATE POLICY "Membros leem mensagens do grupo"
  ON public.community_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members member
      WHERE member.community_id = community_messages.community_id
        AND member.user_id = auth.uid()
        AND member.status = 'ativo'
    )
  );

DROP POLICY IF EXISTS "Membros enviam mensagens ao grupo" ON public.community_messages;
CREATE POLICY "Membros enviam mensagens ao grupo"
  ON public.community_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_members member
      WHERE member.community_id = community_messages.community_id
        AND member.user_id = auth.uid()
        AND member.status = 'ativo'
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.communities (name, description, rules_json)
SELECT * FROM (
  VALUES
    ('Conversas leves', 'Um espaco para conversar sobre o dia e encontrar companhia.', '["Respeite o tempo de cada pessoa","Nao compartilhe dados pessoais","Sem diagnosticos ou prescricoes"]'::jsonb),
    ('Ansiedade e rotina', 'Trocas acolhedoras sobre ansiedade, habitos e pequenos passos.', '["Fale a partir da propria experiencia","Evite gatilhos explicitos","Procure ajuda profissional quando necessario"]'::jsonb),
    ('Luto e saudade', 'Um grupo cuidadoso para quem esta atravessando perdas.', '["Acolha sem comparar dores","Nao pressione ninguem a responder","Use aviso antes de conteudo sensivel"]'::jsonb)
) AS seed(name, description, rules_json)
WHERE NOT EXISTS (SELECT 1 FROM public.communities);

COMMIT;
