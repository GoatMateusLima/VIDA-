/**
 * VIDA+ - Rotas de Autenticação
 *
 * Endpoints públicos (não requerem token):
 *   POST /api/auth/register → Cria nova conta de usuário
 *   POST /api/auth/login    → Autentica e retorna token JWT de sessão
 *
 * Endpoints protegidos (requerem token Bearer no header Authorization):
 *   POST /api/auth/logout   → Invalida a sessão atual no Supabase
 *
 * Fluxo do frontend:
 *   1. Chama /register ou /login
 *   2. Armazena o session.access_token retornado
 *   3. Envia o token em todas as requisições: Authorization: Bearer <token>
 *   4. Chama /logout para invalidar o token quando o usuário sair
 */

import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { requireAuth } from '../middlewares/authMiddleware';
import { authLimiter } from '../middlewares/securityMiddleware';

const router = Router();

router.post('/register', authLimiter, UserController.register);
router.post('/login', authLimiter, UserController.login);
router.post('/password/reset', authLimiter, UserController.requestPasswordReset);
router.post('/password/update', authLimiter, requireAuth, UserController.updatePassword);
router.post('/logout', requireAuth, UserController.logout);  // Logout (invalida token)

export default router;
