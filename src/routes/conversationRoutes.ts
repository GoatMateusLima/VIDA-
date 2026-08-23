/**
 * VIDA+ - Rotas de Atendimentos (Conversas)
 *
 * Gerencia todo o ciclo de vida de um atendimento emocional na plataforma.
 *
 * Rotas acessíveis por qualquer usuário autenticado:
 *   POST /api/conversations              → Entra na fila de atendimento
 *   GET  /api/conversations/:id          → Consulta conversa + mensagens (com controle de acesso)
 *   POST /api/conversations/:id/messages → Envia uma mensagem no atendimento
 *   POST /api/conversations/:id/close    → Encerra o atendimento
 *
 * Rotas exclusivas para voluntários, moderadores e administradores:
 *   GET  /api/conversations/volunteer/queue       → Fila de atendimentos aguardando
 *   POST /api/conversations/:id/accept            → Voluntário assume atendimento da fila
 *   POST /api/conversations/:id/risk-flags        → Sinaliza risco operacional no atendimento
 *   GET  /api/conversations/volunteer/dashboard   → Métricas resumidas do painel do voluntário
 *
 * Nota: a ordem das rotas importa — rotas estáticas (/volunteer/queue) devem
 * vir ANTES das rotas dinâmicas (/:id) para evitar conflitos de matching.
 */

import { Router } from 'express';
import { ConversationController } from '../controllers/ConversationController';
import { requireAuth, requireRoles } from '../middlewares/authMiddleware';

const router = Router();

// ─── Rotas do Voluntário (estáticas — devem vir antes de /:id) ───────────────
router.get('/volunteer/queue',
  requireAuth,
  requireRoles('voluntario'),
  ConversationController.getQueue
);
router.get('/volunteer/queue-events',
  requireAuth,
  requireRoles('voluntario', 'moderador', 'administrador'),
  ConversationController.queueEvents
);
router.get('/volunteer/dashboard',
  requireAuth,
  requireRoles('voluntario', 'administrador'),
  ConversationController.getDashboard
);

// ─── Rotas do Usuário ─────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.create);
router.get('/', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.history);
router.get('/:id/events', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.events);
router.get('/:id', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.getById);
router.post('/:id/messages', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.sendMessage);
router.post('/:id/typing', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.typing);
router.post('/:id/close', requireAuth, requireRoles('cadastrado', 'voluntario', 'moderador', 'administrador'), ConversationController.close);

// ─── Rotas do Voluntário/Admin (dinâmicas com :id) ───────────────────────────
router.post('/:id/accept',
  requireAuth,
  requireRoles('voluntario'),
  ConversationController.accept
);
router.post('/:id/risk-flags',
  requireAuth,
  requireRoles('voluntario'),
  ConversationController.flagRisk
);

export default router;
