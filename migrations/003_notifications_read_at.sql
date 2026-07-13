-- VIDA+ — Migration 003: adiciona read_at em notifications
-- O frontend lê o campo read_at para saber se a notificação foi lida.
-- O banco usava apenas status VARCHAR; esta migration adiciona o campo
-- e sincroniza os registros existentes.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;

-- Sincroniza registros já marcados como lidos
UPDATE public.notifications
SET read_at = sent_at
WHERE status = 'lida' AND read_at IS NULL;

COMMIT;
