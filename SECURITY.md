# Segurança

- A chave `SUPABASE_SERVICE_ROLE_KEY` permanece exclusivamente no backend.
- Mensagens novas usam AES-256-GCM com uma chave Base64 de 32 bytes.
- Gere a chave com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- Configure `CORS_ORIGINS` com os domínios reais, separados por vírgula.
- Execute `migrations/001_production_hardening.sql` no Supabase.
- Nunca versione `.env`, tokens, dumps ou conteúdo de conversas.
- Rotacione imediatamente qualquer segredo que tenha sido compartilhado publicamente.
- O backend aplica rate limiting, headers seguros, limite de payload e RBAC.
- Logs e respostas usam `requestId`; não registre tokens nem corpos de mensagens.
