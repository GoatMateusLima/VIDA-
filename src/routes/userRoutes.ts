/**
 * VIDA+ - Rotas de Perfil do Usuário Logado
 *
 * Todos os endpoints aqui exigem autenticação (token JWT válido no header).
 * O middleware `requireAuth` injeta os dados do usuário em req.user.
 *
 * Endpoints:
 *   GET   /api/users/me                → Retorna dados do usuário logado + perfil
 *   PATCH /api/users/me/preferences    → Atualiza nickname, estado, preferências
 *   POST  /api/users/me/consent        → Registra aceite de termos/privacidade (LGPD)
 *
 * Nota: "me" é um padrão REST para "o recurso referente ao usuário autenticado"
 * O ID do usuário nunca precisa ser passado na URL — vem do token.
 */

import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { requireAuth, requireRoles } from '../middlewares/authMiddleware';

const router = Router();

router.get('/admin', requireAuth, requireRoles('administrador'), UserController.listUsers);
router.patch('/admin/:id/role', requireAuth, requireRoles('administrador'), UserController.updateRole);

router.get('/me', requireAuth, UserController.me);                          // Dados completos do usuário
router.patch('/me/preferences', requireAuth, UserController.updatePreferences); // Atualiza perfil
router.post('/me/consent', requireAuth, UserController.acceptConsent);      // Registro de consentimento LGPD

export default router;
