# VIDA+ — Guia de Integração Frontend ↔ Backend

> Documento gerado automaticamente a partir do código-fonte do backend.
> Cole este arquivo no seu projeto frontend como referência de integração.

---

## 1. Configuração Base

```
BASE_URL = https://<seu-dominio>/api
```

Em desenvolvimento local:
```
BASE_URL = http://localhost:3000/api
```

### Headers obrigatórios em toda requisição autenticada
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## 2. Autenticação (JWT via Supabase)

O backend usa **Supabase Auth**. Após login, você recebe um `access_token` (JWT).
Envie-o em **todas** as requisições protegidas no header `Authorization: Bearer <token>`.

### Papéis de usuário (roles)
| Role | Descrição |
|------|-----------|
| `anonimo` | Sessão sem cadastro |
| `cadastrado` | Usuário comum registrado |
| `voluntario` | Voluntário aprovado |
| `moderador` | Moderador da plataforma |
| `administrador` | Acesso total |

---

## 3. Formato padrão de resposta

**Sucesso:**
```json
{
  "status": "success",
  "message": "Texto opcional",
  "data": { ... }
}
```

**Erro:**
```json
{
  "status": "error",
  "message": "Descrição do erro",
  "errors": [ ... ]
}
```

Códigos HTTP usados: `200`, `201`, `400`, `401`, `403`, `404`, `422`, `429`, `500`


---

## 4. Endpoints de Autenticação

### `GET /health` — Status da API (público)
```
GET /api/health
```
**Resposta 200:**
```json
{
  "status": "success",
  "message": "Backend Vida+ operacional",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### `POST /auth/register` — Cadastro
```
POST /api/auth/register
```
**Body:**
```json
{
  "email": "usuario@email.com",
  "password": "MinhaSenha1",
  "displayName": "Nome do Usuário"
}
```
Regras da senha: mínimo 10 caracteres, 1 maiúscula, 1 minúscula, 1 número.

**Resposta 201:**
```json
{
  "status": "success",
  "message": "Usuário cadastrado com sucesso!",
  "data": {
    "user": { "id": "uuid", "email": "...", "displayName": "..." }
  }
}
```

---

### `POST /auth/login` — Login
```
POST /api/auth/login
```
**Body:**
```json
{
  "email": "usuario@email.com",
  "password": "MinhaSenha1"
}
```
**Resposta 200:**
```json
{
  "status": "success",
  "data": {
    "session": {
      "access_token": "eyJ...",
      "refresh_token": "...",
      "expires_in": 3600,
      "token_type": "bearer"
    },
    "user": { "id": "uuid", "email": "...", "role": "cadastrado" }
  }
}
```
> Armazene `access_token` e `refresh_token`. Use o `access_token` em todas as requisições.


---

### `POST /auth/anonymous` — Sessão anônima (sem cadastro)
```
POST /api/auth/anonymous
```
Sem body. Cria uma sessão pseudônima para usuários que não querem se cadastrar.

**Resposta 201:**
```json
{
  "status": "success",
  "message": "Sessão pseudônima criada.",
  "data": {
    "session": { "access_token": "eyJ...", "refresh_token": "..." },
    "user": { "id": "uuid", "role": "anonimo" }
  }
}
```

---

### `POST /auth/password/reset` — Solicitar reset de senha (público)
```
POST /api/auth/password/reset
```
**Body:**
```json
{ "email": "usuario@email.com" }
```
**Resposta 200:**
```json
{
  "status": "success",
  "message": "Se o e-mail estiver cadastrado, você receberá as instruções de recuperação."
}
```

---

### `POST /auth/password/update` — Atualizar senha (autenticado)
```
POST /api/auth/password/update
Authorization: Bearer <token>
```
**Body:**
```json
{ "password": "NovaSenha1" }
```
**Resposta 200:**
```json
{ "status": "success", "message": "Senha atualizada com sucesso." }
```

---

### `POST /auth/logout` — Logout (autenticado)
```
POST /api/auth/logout
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{ "status": "success", "message": "Logout realizado com sucesso!" }
```


---

## 5. Endpoints de Usuário

### `GET /users/me` — Perfil do usuário logado
```
GET /api/users/me
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "display_name": "Nome",
    "role": "cadastrado",
    "status": "ativo",
    "created_at": "...",
    "profile": {
      "nickname": "apelido",
      "birth_year": 1995,
      "state": "SP",
      "preferences_json": {}
    }
  }
}
```

---

### `PATCH /users/me/preferences` — Atualizar perfil
```
PATCH /api/users/me/preferences
Authorization: Bearer <token>
```
**Body (todos os campos são opcionais):**
```json
{
  "nickname": "apelido",
  "birth_year": 1995,
  "state": "SP",
  "preferences_json": { "notificacoes": true }
}
```
Regras: `nickname` 2-50 chars; `state` exatamente 2 letras (ex: "SP"); `birth_year` ≥ 1900, idade mínima 13 anos.

**Resposta 200:**
```json
{ "status": "success", "message": "Preferências atualizadas com sucesso!", "data": { ... } }
```

---

### `POST /users/me/consent` — Registrar aceite LGPD
```
POST /api/users/me/consent
Authorization: Bearer <token>
```
**Body:**
```json
{
  "type": "termos_de_uso",
  "version": "1.0"
}
```
Valores de `type`: `"termos_de_uso"` | `"politica_privacidade"` | `"comunicacoes"`

**Resposta 200:**
```json
{ "status": "success", "message": "Consentimento registrado!", "data": { ... } }
```

---

### `GET /users/admin` — Listar todos os usuários (admin only)
```
GET /api/users/admin
Authorization: Bearer <token>  (role: administrador)
```
**Resposta 200:**
```json
{ "status": "success", "data": [ { "id": "uuid", "display_name": "...", "role": "...", ... } ] }
```

---

### `PATCH /users/admin/:id/role` — Alterar papel de usuário (admin only)
```
PATCH /api/users/admin/:id/role
Authorization: Bearer <token>  (role: administrador)
```
**Body:**
```json
{ "role": "moderador" }
```
Valores: `"cadastrado"` | `"voluntario"` | `"moderador"` | `"administrador"`


---

## 6. Endpoints de Conversas (Atendimentos)

### `POST /conversations` — Entrar na fila de atendimento
```
POST /api/conversations
Authorization: Bearer <token>
```
Sem body. O sistema cria uma conversa com status `aguardando`.

**Resposta 201:**
```json
{
  "status": "success",
  "message": "Você entrou na fila de atendimento. Um voluntário irá acolher você em breve.",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "status": "aguardando",
    "priority": "normal",
    "created_at": "..."
  }
}
```

---

### `GET /conversations` — Histórico de atendimentos
```
GET /api/conversations?page=1&limit=20
Authorization: Bearer <token>
```
**Query params:** `page` (default 1), `limit` (default 20, max 50)

**Resposta 200:**
```json
{ "status": "success", "data": [ { "id": "uuid", "status": "encerrada", ... } ] }
```

---

### `GET /conversations/:id` — Detalhes de um atendimento
```
GET /api/conversations/:id
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "volunteer_id": "uuid",
    "status": "ativa",
    "priority": "normal",
    "started_at": "...",
    "messages": [
      {
        "id": "uuid",
        "sender_id": "uuid",
        "body_encrypted": "texto descriptografado",
        "type": "text",
        "created_at": "..."
      }
    ]
  }
}
```

---

### `GET /conversations/:id/events` — Stream de mensagens em tempo real (SSE)
```
GET /api/conversations/:id/events?after=<ISO_timestamp>
Authorization: Bearer <token>
```
**Conexão Server-Sent Events.** Mantém a conexão aberta e envia eventos conforme chegam.

**Headers de resposta:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```
**Eventos recebidos:**
```
event: message
data: {"id":"uuid","sender_id":"uuid","body_encrypted":"texto","created_at":"..."}

event: heartbeat
data: {"at":"2024-01-01T00:00:00.000Z"}

event: error
data: {"message":"Canal encerrado."}
```
> Use `EventSource` ou `fetch` com `ReadableStream`. Reconecta automaticamente (retry: 3000ms).


---

### `POST /conversations/:id/messages` — Enviar mensagem
```
POST /api/conversations/:id/messages
Authorization: Bearer <token>
```
**Body:**
```json
{ "text": "Olá, preciso de ajuda." }
```
`text`: 1 a 4000 caracteres.

**Resposta 201:**
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "body_encrypted": "texto",
    "type": "text",
    "created_at": "..."
  }
}
```

---

### `POST /conversations/:id/close` — Encerrar atendimento
```
POST /api/conversations/:id/close
Authorization: Bearer <token>
```
**Body:**
```json
{ "reason": "usuario_encerrou" }
```

**Resposta 200:**
```json
{ "status": "success", "message": "Atendimento encerrado.", "data": { ... } }
```

---

### `GET /conversations/volunteer/queue` — Fila de espera (voluntario+)
```
GET /api/conversations/volunteer/queue
Authorization: Bearer <token>  (role: voluntario | moderador | administrador)
```
**Resposta 200:**
```json
{
  "status": "success",
  "data": [
    { "id": "uuid", "user_id": "uuid", "status": "aguardando", "priority": "normal", "created_at": "..." }
  ]
}
```

---

### `POST /conversations/:id/accept` — Voluntário assume atendimento (voluntario+)
```
POST /api/conversations/:id/accept
Authorization: Bearer <token>  (role: voluntario | moderador | administrador)
```
Sem body.

**Resposta 200:**
```json
{ "status": "success", "message": "Você assumiu o atendimento.", "data": { ... } }
```

---

### `POST /conversations/:id/risk-flags` — Sinalizar risco (voluntario+)
```
POST /api/conversations/:id/risk-flags
Authorization: Bearer <token>  (role: voluntario | moderador | administrador)
```
**Body:**
```json
{
  "level": "alto",
  "reason": "Usuário expressa ideação suicida",
  "actionTaken": "encaminhado CVV 188"
}
```
`level`: `"baixo"` | `"medio"` | `"alto"` | `"imediato"`
`actionTaken`: opcional

**Resposta 201:**
```json
{
  "status": "success",
  "message": "Sinalização de risco registrada. Caso necessário, acione o CVV 188 ou o SAMU 192.",
  "data": { ... }
}
```

---

### `GET /conversations/volunteer/dashboard` — Dashboard do voluntário (voluntario+)
```
GET /api/conversations/volunteer/dashboard
Authorization: Bearer <token>  (role: voluntario | moderador | administrador)
```
**Resposta 200:**
```json
{ "status": "success", "data": { "total": 10, "ativas": 2, "encerradas": 8 } }
```


---

## 7. Endpoints de Comunidades

### `GET /communities` — Listar comunidades (autenticado)
```
GET /api/communities
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "Nome da Comunidade",
      "description": "...",
      "status": "ativo",
      "rules_json": ["Regra 1", "Regra 2"],
      "is_member": true,
      "created_at": "..."
    }
  ]
}
```

---

### `POST /communities/:id/join` — Entrar em uma comunidade
```
POST /api/communities/:id/join
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{ "status": "success", "data": { ... } }
```

---

### `POST /communities/:id/leave` — Sair de uma comunidade
```
POST /api/communities/:id/leave
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{ "status": "success", "message": "Você saiu do grupo." }
```

---

### `GET /communities/:id/messages` — Mensagens da comunidade
```
GET /api/communities/:id/messages?page=1&limit=50
Authorization: Bearer <token>
```
**Query params:** `page` (default 1), `limit` (default 50, max 100)

**Resposta 200:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "community_id": "uuid",
      "sender_id": "uuid",
      "alias_snapshot": "NomeAnonimo#1234",
      "body_encrypted": "texto da mensagem",
      "created_at": "...",
      "edited_at": null,
      "deleted_at": null
    }
  ]
}
```
> Mensagens na comunidade são pseudônimas — `alias_snapshot` é o apelido visível, não o nome real.

---

### `POST /communities/:id/messages` — Enviar mensagem na comunidade
```
POST /api/communities/:id/messages
Authorization: Bearer <token>
```
**Body:**
```json
{ "text": "Olá a todos!" }
```
`text`: 1 a 2000 caracteres.

**Resposta 201:**
```json
{ "status": "success", "data": { "id": "uuid", "alias_snapshot": "...", ... } }
```

---

### `POST /communities/messages/:messageId/reveal-identity` — Revelar identidade (moderador+)
```
POST /api/communities/messages/:messageId/reveal-identity
Authorization: Bearer <token>  (role: moderador | administrador)
```
**Body:**
```json
{ "reason": "Investigação de comportamento inapropriado com evidências claras." }
```
`reason`: mínimo 10 caracteres.

**Resposta 200:**
```json
{ "status": "success", "data": { "real_user_id": "uuid", "display_name": "...", ... } }
```


---

## 8. Endpoints de Notificações

### `GET /notifications` — Listar notificações
```
GET /api/notifications?page=1&limit=20
Authorization: Bearer <token>
```
**Query params:** `page` (default 1), `limit` (default 20, max 50)

**Resposta 200:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "title": "Novo atendimento",
      "body": "Um voluntário entrou na sua conversa.",
      "read_at": null,
      "created_at": "..."
    }
  ]
}
```

---

### `PATCH /notifications/:id/read` — Marcar notificação como lida
```
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```
**Resposta 200:**
```json
{ "status": "success", "data": { ... } }
```

---

## 9. Endpoints de Denúncias

### `POST /reports` — Criar denúncia (autenticado)
```
POST /api/reports
Authorization: Bearer <token>
```
**Body (opção 1 — por ID):**
```json
{
  "targetType": "voluntario",
  "targetId": "uuid-do-alvo",
  "reason": "comportamento inapropriado",
  "description": "Texto descritivo opcional"
}
```
**Body (opção 2 — por alias/apelido, para mensagens de comunidade):**
```json
{
  "targetType": "mensagem",
  "reportedAlias": "NomeAnonimo#1234",
  "reason": "assédio"
}
```
`targetType`: `"voluntario"` | `"usuario"` | `"mensagem"` | `"comunidade"`
Obrigatório: `targetId` **ou** `reportedAlias` (ao menos um).

**Resposta 201:**
```json
{
  "status": "success",
  "message": "Sua denúncia foi registrada e será analisada pela equipe técnica administrativa.",
  "data": { ... }
}
```

---

### `GET /reports/admin/reports` — Listar denúncias (moderador+)
```
GET /api/reports/admin/reports?status=pendente
Authorization: Bearer <token>  (role: moderador | administrador)
```
**Query params:** `status` (opcional): `"pendente"` | `"em_analise"` | `"resolvido"` | `"arquivado"`

**Resposta 200:**
```json
{ "status": "success", "data": [ { "id": "uuid", "reason": "...", "status": "pendente", ... } ] }
```

---

### `GET /reports/admin/reports/:id` — Detalhe de uma denúncia (moderador+)
```
GET /api/reports/admin/reports/:id
Authorization: Bearer <token>  (role: moderador | administrador)
```
**Resposta 200:**
```json
{ "status": "success", "data": { "id": "uuid", "target_type": "...", "reason": "...", ... } }
```

---

### `PATCH /reports/admin/reports/:id` — Resolver/arquivar denúncia (moderador+)
```
PATCH /api/reports/admin/reports/:id
Authorization: Bearer <token>  (role: moderador | administrador)
```
**Body:**
```json
{
  "status": "resolvido",
  "decision": "Advertência emitida ao voluntário após análise do histórico."
}
```
`status`: `"resolvido"` | `"arquivado"` | `"em_analise"`
`decision`: mínimo 5 caracteres (obrigatório para auditoria).

**Resposta 200:**
```json
{ "status": "success", "message": "Denúncia e caso de moderação atualizados com sucesso.", "data": { ... } }
```


---

## 10. Endpoints Administrativos (Voluntários)

### `POST /admin/volunteers/apply` — Candidatar-se a voluntário (autenticado)
```
POST /api/admin/volunteers/apply
Authorization: Bearer <token>
```
**Body:**
```json
{
  "motivation": "Quero ajudar pessoas em situações difíceis...",
  "experience": "Tenho formação em psicologia e participei de..."
}
```
`motivation`: mínimo 10 caracteres. `experience`: mínimo 5 caracteres.

**Resposta 201:**
```json
{ "status": "success", "message": "Candidatura enviada para análise administrativa!", "data": { ... } }
```

---

### `PATCH /admin/volunteers/availability` — Atualizar disponibilidade (voluntario+)
```
PATCH /api/admin/volunteers/availability
Authorization: Bearer <token>  (role: voluntario | moderador | administrador)
```
**Body:**
```json
{ "status": "online" }
```
`status`: `"online"` | `"ocupado"` | `"offline"`

**Resposta 200:**
```json
{ "status": "success", "message": "Status atualizado com sucesso.", "data": { ... } }
```

---

### `GET /admin/volunteers` — Listar voluntários (admin only)
```
GET /api/admin/volunteers
Authorization: Bearer <token>  (role: administrador)
```
**Resposta 200:**
```json
{ "status": "success", "data": [ { "id": "uuid", "display_name": "...", "status": "online", ... } ] }
```

---

### `GET /admin/volunteers/applications` — Listar candidaturas (admin only)
```
GET /api/admin/volunteers/applications?status=pendente
Authorization: Bearer <token>  (role: administrador)
```
**Query params:** `status` (opcional): `"pendente"` | `"aprovada"` | `"rejeitada"`

**Resposta 200:**
```json
{ "status": "success", "data": [ { "id": "uuid", "motivation": "...", "status": "pendente", ... } ] }
```

---

### `GET /admin/volunteers/applications/:id` — Detalhe de candidatura (admin only)
```
GET /api/admin/volunteers/applications/:id
Authorization: Bearer <token>  (role: administrador)
```
**Resposta 200:**
```json
{ "status": "success", "data": { "id": "uuid", "motivation": "...", "experience": "...", "status": "pendente", ... } }
```

---

### `POST /admin/volunteers/:id/approve` — Aprovar candidatura (admin only)
```
POST /api/admin/volunteers/:id/approve
Authorization: Bearer <token>  (role: administrador)
```
`:id` = ID da candidatura. Sem body.

**Resposta 200:**
```json
{ "status": "success", "message": "Candidatura aprovada! O usuário agora é um Voluntário ativo.", "data": { ... } }
```

---

### `POST /admin/volunteers/:id/reject` — Rejeitar candidatura (admin only)
```
POST /api/admin/volunteers/:id/reject
Authorization: Bearer <token>  (role: administrador)
```
**Body (opcional):**
```json
{ "decision": "Perfil não atende aos critérios mínimos." }
```

**Resposta 200:**
```json
{ "status": "success", "message": "Candidatura rejeitada.", "data": { ... } }
```

---

### `POST /admin/volunteers/:id/suspend` — Suspender voluntário (admin only)
```
POST /api/admin/volunteers/:id/suspend
Authorization: Bearer <token>  (role: administrador)
```
`:id` = `user_id` do voluntário. Sem body.

**Resposta 200:**
```json
{ "status": "success", "message": "Voluntário suspenso com sucesso." }
```


---

## 11. Rotas Admin de Comunidades (admin only)

### `GET /communities/admin` — Listar comunidades (admin)
```
GET /api/communities/admin
Authorization: Bearer <token>  (role: administrador)
```

### `POST /communities/admin` — Criar comunidade (admin)
```
POST /api/communities/admin
Authorization: Bearer <token>  (role: administrador)
```
**Body:**
```json
{
  "name": "Nome da Comunidade",
  "description": "Descrição opcional",
  "rules": ["Seja respeitoso", "Sem spam"]
}
```
`name`: 3-100 chars. `rules`: array de strings, máx 20 itens.

### `GET /communities/admin/:id` — Detalhe (admin)
```
GET /api/communities/admin/:id
Authorization: Bearer <token>  (role: administrador)
```

### `PATCH /communities/admin/:id` — Atualizar comunidade (admin)
```
PATCH /api/communities/admin/:id
Authorization: Bearer <token>  (role: administrador)
```
**Body (todos opcionais):**
```json
{
  "name": "Novo nome",
  "description": "Nova descrição",
  "rules": ["Regra atualizada"],
  "status": "pausado"
}
```
`status`: `"ativo"` | `"pausado"` | `"arquivado"`

### `PATCH /communities/admin/:id/members/:userId` — Gerenciar membro (admin)
```
PATCH /api/communities/admin/:id/members/:userId
Authorization: Bearer <token>  (role: administrador)
```
**Body:**
```json
{ "status": "removido" }
```
`status`: `"ativo"` | `"removido"`

### `DELETE /communities/admin/messages/:messageId` — Deletar mensagem (admin)
```
DELETE /api/communities/admin/messages/:messageId
Authorization: Bearer <token>  (role: administrador)
```
**Body:**
```json
{ "reason": "Conteúdo que viola as regras da comunidade conforme política." }
```
`reason`: mínimo 10 caracteres.


---

## 12. Tabela resumo de permissões

| Endpoint | anonimo | cadastrado | voluntario | moderador | administrador |
|----------|:-------:|:----------:|:----------:|:---------:|:-------------:|
| POST /auth/* | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /users/me | ❌ | ✅ | ✅ | ✅ | ✅ |
| PATCH /users/me/preferences | ❌ | ✅ | ✅ | ✅ | ✅ |
| POST /users/me/consent | ❌ | ✅ | ✅ | ✅ | ✅ |
| GET/PATCH /users/admin | ❌ | ❌ | ❌ | ❌ | ✅ |
| POST /conversations | ❌ | ✅ | ✅ | ✅ | ✅ |
| GET /conversations/:id | ❌ | ✅* | ✅* | ✅ | ✅ |
| POST /conversations/:id/messages | ❌ | ✅* | ✅* | ✅ | ✅ |
| GET /conversations/volunteer/queue | ❌ | ❌ | ✅ | ✅ | ✅ |
| POST /conversations/:id/accept | ❌ | ❌ | ✅ | ✅ | ✅ |
| POST /conversations/:id/risk-flags | ❌ | ❌ | ✅ | ✅ | ✅ |
| GET /communities | ❌ | ✅ | ✅ | ✅ | ✅ |
| POST /communities/:id/join | ❌ | ✅ | ✅ | ✅ | ✅ |
| GET /communities/:id/messages | ❌ | ✅ | ✅ | ✅ | ✅ |
| POST /communities/:id/messages | ❌ | ✅ | ✅ | ✅ | ✅ |
| POST /communities/messages/:id/reveal-identity | ❌ | ❌ | ❌ | ✅ | ✅ |
| GET /notifications | ❌ | ✅ | ✅ | ✅ | ✅ |
| POST /reports | ❌ | ✅ | ✅ | ✅ | ✅ |
| GET/PATCH /reports/admin/reports | ❌ | ❌ | ❌ | ✅ | ✅ |
| POST /admin/volunteers/apply | ❌ | ✅ | ✅ | ✅ | ✅ |
| PATCH /admin/volunteers/availability | ❌ | ❌ | ✅ | ✅ | ✅ |
| GET /admin/volunteers/applications | ❌ | ❌ | ❌ | ❌ | ✅ |
| POST /admin/volunteers/:id/approve | ❌ | ❌ | ❌ | ❌ | ✅ |
| POST /admin/volunteers/:id/suspend | ❌ | ❌ | ❌ | ❌ | ✅ |
| GET /communities/admin/* | ❌ | ❌ | ❌ | ❌ | ✅ |

> ✅* = acesso restrito ao próprio usuário ou voluntário da conversa


---

## 13. Rate Limiting

O backend aplica limites de requisição:

- **Rotas de auth** (`/auth/register`, `/auth/login`, `/auth/anonymous`, etc.): limite mais restrito (proteção contra brute force)
- **Todas as rotas** (`/api/*`): limite geral por IP

Quando o limite é atingido, o backend retorna:
```
HTTP 429 Too Many Requests
```
```json
{ "status": "error", "message": "Muitas requisições. Tente novamente em instantes." }
```
> Implemente retry com backoff exponencial no frontend para lidar com 429.

---

## 14. Tratamento de Erros no Frontend

| HTTP | Ação recomendada |
|------|-----------------|
| 400 | Exibir mensagem do campo com erro de validação |
| 401 | Redirecionar para login / renovar token |
| 403 | Exibir "Sem permissão" / esconder funcionalidade |
| 404 | Exibir "Não encontrado" |
| 422 | Exibir erros de validação do campo `errors` |
| 429 | Aguardar e tentar novamente com backoff |
| 500 | Exibir erro genérico / contatar suporte |

---

## 15. Client HTTP de exemplo (TypeScript)

```typescript
// api.ts — cliente base para o VIDA+

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

function getToken(): string | null {
  return localStorage.getItem('vida_access_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) throw { status: res.status, ...json };
  return json;
}

// Funções de conveniência
export const api = {
  get:    <T>(path: string, params?: Record<string, string>) =>
            request<T>('GET', path, undefined, params),
  post:   <T>(path: string, body?: unknown) =>
            request<T>('POST', path, body),
  patch:  <T>(path: string, body?: unknown) =>
            request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) =>
            request<T>('DELETE', path, body),
};

// Salva os tokens após login/register
export function saveSession(accessToken: string, refreshToken: string) {
  localStorage.setItem('vida_access_token', accessToken);
  localStorage.setItem('vida_refresh_token', refreshToken);
}

export function clearSession() {
  localStorage.removeItem('vida_access_token');
  localStorage.removeItem('vida_refresh_token');
}
```

---

## 16. Exemplos de uso

```typescript
// Login
const { data } = await api.post('/auth/login', {
  email: 'user@email.com',
  password: 'MinhaSenha1'
});
saveSession(data.session.access_token, data.session.refresh_token);

// Perfil
const { data: user } = await api.get('/users/me');

// Entrar na fila de atendimento
const { data: conversa } = await api.post('/conversations');

// Enviar mensagem
await api.post(`/conversations/${conversa.id}/messages`, {
  text: 'Olá, preciso de ajuda.'
});

// SSE — escutar mensagens em tempo real
const evtSource = new EventSource(
  `${BASE_URL}/conversations/${conversa.id}/events`,
  // EventSource não suporta headers nativamente — use uma lib como fetch-event-source
);
evtSource.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  console.log('Nova mensagem:', msg);
});

// Candidatura a voluntário
await api.post('/admin/volunteers/apply', {
  motivation: 'Quero ajudar...',
  experience: 'Tenho formação em...'
});
```

> Para SSE com header `Authorization`, use a biblioteca [`@microsoft/fetch-event-source`](https://github.com/Azure/fetch-event-source) ou similar, pois o `EventSource` nativo do browser não suporta headers customizados.

---

*Gerado em: 2026-07-12 | Backend VIDA+ v1*
