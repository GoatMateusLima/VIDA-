import { Router } from 'express';
import { CommunityController } from '../controllers/CommunityController';
import { requireAuth, requireRoles } from '../middlewares/authMiddleware';

const router = Router();

router.get('/admin', requireAuth, requireRoles('administrador'), CommunityController.adminList);
router.post('/admin', requireAuth, requireRoles('administrador'), CommunityController.adminCreate);
router.get('/admin/:id', requireAuth, requireRoles('administrador'), CommunityController.adminDetail);
router.patch('/admin/:id', requireAuth, requireRoles('administrador'), CommunityController.adminUpdate);
router.patch(
  '/admin/:id/members/:userId',
  requireAuth,
  requireRoles('administrador'),
  CommunityController.adminUpdateMember
);
router.delete(
  '/admin/messages/:messageId',
  requireAuth,
  requireRoles('administrador'),
  CommunityController.adminDeleteMessage
);
router.get('/', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.list);
router.post('/:id/join', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.join);
router.post('/:id/leave', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.leave);
router.get('/:id/events', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.events);
router.post('/:id/presence', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.presence);
router.get('/:id/online-users', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.onlineUsers);
router.post('/:id/typing', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.typing);
router.get('/:id/messages', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.messages);
router.post('/:id/messages', requireAuth, requireRoles('cadastrado', 'moderador', 'administrador'), CommunityController.send);
router.post(
  '/messages/:messageId/reveal-identity',
  requireAuth,
  requireRoles('moderador', 'administrador'),
  CommunityController.revealIdentity
);

export default router;
