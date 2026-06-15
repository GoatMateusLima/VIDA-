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
  requireRoles('voluntario', 'moderador', 'administrador'),
  ConversationController.getQueue
);
router.get('/volunteer/dashboard',
  requireAuth,
  requireRoles('voluntario', 'moderador', 'administrador'),
  ConversationController.getDashboard
);

// ─── Rotas do Usuário ─────────────────────────────────────────────────────────
router.post('/', requireAuth, ConversationController.create);               // Entrar na fila
router.get('/', requireAuth, ConversationController.history);
router.get('/:id/events', requireAuth, ConversationController.events);
router.get('/:id', requireAuth, ConversationController.getById);            // Ver conversa + mensagens
router.post('/:id/messages', requireAuth, ConversationController.sendMessage); // Enviar mensagem
router.post('/:id/close', requireAuth, ConversationController.close);       // Encerrar atendimento

// ─── Rotas do Voluntário/Admin (dinâmicas com :id) ───────────────────────────
router.post('/:id/accept',
  requireAuth,
  requireRoles('voluntario', 'moderador', 'administrador'),
  ConversationController.accept
);
router.post('/:id/risk-flags',
  requireAuth,
  requireRoles('voluntario', 'moderador', 'administrador'),
  ConversationController.flagRisk
);

export default router;
