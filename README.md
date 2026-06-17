# VIDA+

Backend em Node.js, Express e TypeScript para a plataforma VIDA+. A API usa
Supabase para autenticacao, banco de dados, RLS e operacoes administrativas via
service role.

## Status atual

Verificado em 17/06/2026 contra o projeto Supabase configurado no `.env`:

- 16 tabelas esperadas acessiveis sem falhas.
- `community_members.alias` existe e esta funcionando.
- `community_messages` existe e esta funcionando.
- Comunidades iniciais criadas:
  - Ansiedade e rotina
  - Conversas leves
  - Luto e saudade

## Como rodar

```bash
npm install
npm run dev
```

API local:

```text
http://localhost:3000/api
```

Health check:

```text
GET /api/health
```

## Variaveis de ambiente

Use `.env.example` como base:

```text
PORT=3000
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
NODE_ENV=development
MESSAGE_ENCRYPTION_KEY=
CORS_ORIGINS=http://localhost:5173
TRUST_PROXY=0
PASSWORD_RESET_REDIRECT_URL=http://localhost:5173/redefinir-senha
```

Em producao, `MESSAGE_ENCRYPTION_KEY` precisa ser uma chave Base64 de 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Banco de dados

O banco e montado no Supabase.

Ordem para criar um banco novo:

1. Rodar `schema.sql` no SQL Editor do Supabase.
2. Rodar `migrations/001_production_hardening.sql`.
3. Rodar `migrations/002_pseudonymous_communities.sql`.

O `schema.sql` cria a estrutura principal:

- usuarios e perfis
- consentimentos LGPD
- candidaturas e perfis de voluntarios
- conversas, mensagens e sinalizacoes de risco
- denuncias e casos de moderacao
- comunidades e membros
- notificacoes e push subscriptions
- logs de auditoria
- trigger `on_auth_user_created` para criar `public.users` e
  `public.user_profiles` quando uma conta e criada no Supabase Auth

As migrations aplicam os ajustes posteriores:

- indices e constraints de producao
- politicas RLS mais restritas
- suporte a comunidades pseudonimas
- tabela `community_messages`
- seeds das comunidades iniciais

## Arquitetura

Estrutura principal:

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

Fluxo de uma requisicao:

```text
cliente
  -> src/server.ts
  -> src/app.ts
  -> src/routes/*
  -> middlewares de seguranca/autenticacao
  -> controllers
  -> services
  -> Supabase
  -> resposta JSON
```

Regras praticas:

- Controllers validam entrada e formatam resposta.
- Services concentram regra de negocio e chamadas ao Supabase.
- `supabase` usa a anon key para Auth do usuario.
- `supabaseAdmin` usa service role somente no backend.
- Middlewares aplicam autenticacao, RBAC, rate limit, headers seguros e padrao
  de erro.

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

### Voluntariado e administracao

- `POST /api/admin/volunteers/apply`
- `PATCH /api/admin/volunteers/availability`
- `GET /api/admin/volunteers/applications`
- `POST /api/admin/volunteers/:id/approve`
- `POST /api/admin/volunteers/:id/suspend`

### Denuncias e moderacao

- `POST /api/reports`
- `GET /api/reports/admin/reports`
- `PATCH /api/reports/admin/reports/:id`

Todas as falhas retornam um JSON padronizado com `status`, `message` e
`requestId`.

## Seguranca

- Nunca versionar `.env`, tokens, dumps ou conteudo de conversas.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente no backend.
- Mensagens sao criptografadas antes de serem salvas.
- Em producao, configurar `CORS_ORIGINS` com os dominios reais.
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

## Deploy no Render

URL atual do backend:

```text
https://vida-43t9.onrender.com
```

O Render precisa compilar o TypeScript antes de iniciar o servidor. O erro:

```text
Cannot find module '/opt/render/project/src/dist/server.js'
```

significa que o comando de start tentou rodar `node dist/server.js`, mas a pasta
`dist` nao tinha sido gerada no deploy.

Configuracao recomendada no Render:

```text
Build Command: npm install && npm run build
Start Command: npm start
Health Check Path: /api/health
Node Version: 20
```

O projeto tambem tem `render.yaml` com essa configuracao e `prestart` no
`package.json` para rodar `npm run build` antes de `npm start`.

Variaveis obrigatorias no Render:

```text
PORT
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NODE_ENV=production
MESSAGE_ENCRYPTION_KEY
CORS_ORIGINS
TRUST_PROXY=1
PASSWORD_RESET_REDIRECT_URL
```

## Limpeza da documentacao

Este `README.md` substitui os documentos antigos `API.md`, `ARQUITETURA.md`,
`COMO_FUNCIONA.md` e `SECURITY.md`. A documentacao operacional fica aqui; os
arquivos SQL ficam em `schema.sql` e `migrations/`.
