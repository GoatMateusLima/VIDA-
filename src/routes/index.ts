/**
 * VIDA+ - Roteamento Central da API
 *
 * Este arquivo agrega todos os módulos de rotas e os registra no router principal.
 * Cada módulo é responsável por um domínio funcional da aplicação.
 *
 * Rotas registradas:
 *   GET  /health                       → Health check (sem autenticação)
 *   *    /auth/*                       → Autenticação (authRoutes.ts)
 *   *    /users/*                      → Perfil do usuário (userRoutes.ts)
 *   *    /conversations/*              → Atendimentos e chat (conversationRoutes.ts)
 *   *    /reports, /admin/reports      → Denúncias (reportRoutes.ts)
 *   *    /admin/*                      → Gestão de voluntários (adminRoutes.ts)
 */

import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import conversationRoutes from './conversationRoutes';
import reportRoutes from './reportRoutes';
import adminRoutes from './adminRoutes';
import notificationRoutes from './notificationRoutes';
import communityRoutes from './communityRoutes';

const router = Router();

// ─── Health Check (sem autenticação) ─────────────────────────────────────────
// Usado por ferramentas de monitoramento para verificar se a API está online
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Backend Vida+ operacional',
    timestamp: new Date().toISOString(),
  });
});

// ─── Módulos de Rotas ─────────────────────────────────────────────────────────
router.use('/auth', authRoutes);           // POST /auth/register, /auth/login, /auth/logout
router.use('/users', userRoutes);          // GET /users/me, PATCH /users/me/preferences
router.use('/conversations', conversationRoutes); // Conversas, mensagens, fila, risco
router.use('/reports', reportRoutes);      // POST /reports, GET+PATCH /admin/reports
router.use('/admin', adminRoutes);         // Candidaturas e gestão de voluntários
router.use('/notifications', notificationRoutes);
router.use('/communities', communityRoutes);

export default router;
