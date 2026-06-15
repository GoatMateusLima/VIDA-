# API VIDA+

Base local: `http://localhost:3000/api`

Rotas autenticadas usam `Authorization: Bearer <access_token>`.

## Autenticação

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/password/reset`
- `POST /auth/password/update`

## Usuário

- `GET /users/me`
- `PATCH /users/me/preferences`
- `POST /users/me/consent`

## Atendimentos

- `POST /conversations`
- `GET /conversations?page=1&limit=20`
- `GET /conversations/:id`
- `GET /conversations/:id/events` (SSE)
- `POST /conversations/:id/messages`
- `POST /conversations/:id/close`
- `GET /conversations/volunteer/queue`
- `GET /conversations/volunteer/dashboard`
- `POST /conversations/:id/accept`
- `POST /conversations/:id/risk-flags`

## Notificações

- `GET /notifications?page=1&limit=20`
- `PATCH /notifications/:id/read`

## Administração e moderação

- `POST /admin/volunteers/apply`
- `PATCH /admin/volunteers/availability`
- `GET /admin/volunteers/applications`
- `POST /admin/volunteers/:id/approve`
- `POST /admin/volunteers/:id/suspend`
- `POST /reports`
- `GET /reports/admin/reports`
- `PATCH /reports/admin/reports/:id`

Todas as falhas retornam `status`, `message` e `requestId`.
