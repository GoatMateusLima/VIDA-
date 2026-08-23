# VIDA+ Backend

Backend em Node.js, Express e TypeScript para a plataforma VIDA+. A API usa
Supabase para autenticacao, banco de dados, RLS e operacoes administrativas via
service role.

## URLs

```text
Local:   http://localhost:3000/api
Render:  https://vida-server-9khr.onrender.com/api
Health:  /api/health
```

## Como Rodar

```bash
npm install
npm run dev
```

Para compilar e iniciar o build:

```bash
npm run build
npm start
```

## Variaveis de Ambiente

Use `.env.example` como base.

```env
PORT=3000
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NODE_ENV=development
MESSAGE_ENCRYPTION_KEY=
CORS_ORIGINS=http://localhost:5173,https://vida-acolhimento-digital.netlify.app
TRUST_PROXY=0
PASSWORD_RESET_REDIRECT_URL=http://localhost:5173/recuperar-senha
```

Em producao no Render, use:

```env
NODE_ENV=production
TRUST_PROXY=1
CORS_ORIGINS=https://vida-acolhimento-digital.netlify.app,http://localhost:5173
PASSWORD_RESET_REDIRECT_URL=https://vida-acolhimento-digital.netlify.app/recuperar-senha
```

Gere `MESSAGE_ENCRYPTION_KEY` com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Banco de Dados

O banco roda no Supabase.

Para preparar um banco novo, rode no SQL Editor do Supabase:

1. `schema.sql`
2. `migrations/001_production_hardening.sql`
3. `migrations/002_pseudonymous_communities.sql`

O `schema.sql` cria:

- usuarios e perfis
- consentimentos LGPD
- candidaturas e perfis de voluntarios
- conversas, mensagens e sinalizacoes de risco
- denuncias e casos de moderacao
- comunidades e membros
- notificacoes e push subscriptions
- logs de auditoria
- trigger `on_auth_user_created`

As migrations adicionam hardening de producao, indices, politicas RLS mais
restritas, comunidades pseudonimas, `community_messages` e comunidades iniciais.

## Arquitetura

```text
src/
  app.ts
  server.ts
  config/
    database.ts
    env.ts
  controllers/
  middlewares/
  routes/
  services/
  types/
  utils/
```

Fluxo:

```text
cliente
  -> routes
  -> middlewares
  -> controllers
  -> services
  -> Supabase
  -> resposta JSON
```

Regras:

- Controllers validam entrada e formatam respostas.
- Services concentram regra de negocio e chamadas ao Supabase.
- `supabase` usa anon key para Auth.
- `supabaseAdmin` usa service role somente no backend.
- Middlewares aplicam autenticacao, RBAC, rate limit, headers seguros e erros
  padronizados.

## Rotas

Rotas autenticadas usam:

```text
Authorization: Bearer <access_token>
```

### Autenticacao

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/anonymous`
- `POST /api/auth/logout`
- `POST /api/auth/password/reset`
- `POST /api/auth/password/update`

### Usuario

- `GET /api/users/me`
- `PATCH /api/users/me/preferences`
- `POST /api/users/me/consent`

### Atendimentos

- `POST /api/conversations`
- `GET /api/conversations?page=1&limit=20`
- `GET /api/conversations/:id`
- `GET /api/conversations/:id/events`
- `POST /api/conversations/:id/messages`
- `POST /api/conversations/:id/close`
- `GET /api/conversations/volunteer/queue`
- `GET /api/conversations/volunteer/dashboard`
- `POST /api/conversations/:id/accept`
- `POST /api/conversations/:id/risk-flags`

### Comunidades

- `GET /api/communities`
- `POST /api/communities/:id/join`
- `POST /api/communities/:id/leave`
- `GET /api/communities/:id/messages`
- `POST /api/communities/:id/messages`
- `POST /api/communities/messages/:messageId/reveal-identity`
- `GET /api/communities/admin`
- `POST /api/communities/admin`
- `GET /api/communities/admin/:id`
- `PATCH /api/communities/admin/:id`
- `PATCH /api/communities/admin/:id/members/:userId`
- `DELETE /api/communities/admin/messages/:messageId`

### Notificacoes

- `GET /api/notifications?page=1&limit=20`
- `PATCH /api/notifications/:id/read`

### Voluntariado e Administracao

- `POST /api/admin/volunteers/apply`
- `PATCH /api/admin/volunteers/availability`
- `GET /api/admin/volunteers/applications`
- `POST /api/admin/volunteers/:id/approve`
- `POST /api/admin/volunteers/:id/suspend`

### Denuncias e Moderacao

- `POST /api/reports`
- `GET /api/reports/admin/reports`
- `PATCH /api/reports/admin/reports/:id`

Todas as falhas retornam JSON com `status`, `message` e `requestId`.

## Deploy no Render

Configuracao recomendada:

```text
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
Health Check Path: /api/health
Node Version: 20
```

O projeto inclui `render.yaml` e `prestart` no `package.json`.

Se o servico foi criado manualmente no Render, ajuste os comandos no painel. Se
o Start Command estiver como `node dist/server.js`, troque para `npm start`.

## Seguranca

- Nunca versionar `.env`, tokens, dumps ou conteudo de conversas.
- `SUPABASE_SERVICE_ROLE_KEY` fica somente no backend.
- Mensagens sao criptografadas antes de serem salvas.
- Configure `CORS_ORIGINS` com os dominios reais.
- O backend usa rate limiting, Helmet, limite de payload, RBAC e request id.
- Logs nao devem registrar tokens nem corpo de mensagens.
- Segredos expostos devem ser rotacionados imediatamente.

## Scripts

```bash
npm run dev
npm run build
npm test
npm start
```
