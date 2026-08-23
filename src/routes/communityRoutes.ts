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
router.get('/', requireAuth, CommunityController.list);
router.post('/:id/join', requireAuth, CommunityController.join);
router.post('/:id/leave', requireAuth, CommunityController.leave);
router.get('/:id/events', requireAuth, CommunityController.events);
router.post('/:id/presence', requireAuth, CommunityController.presence);
router.get('/:id/online-users', requireAuth, CommunityController.onlineUsers);
router.post('/:id/typing', requireAuth, CommunityController.typing);
router.get('/:id/messages', requireAuth, CommunityController.messages);
router.post('/:id/messages', requireAuth, CommunityController.send);
router.post(
  '/messages/:messageId/reveal-identity',
  requireAuth,
  requireRoles('moderador', 'administrador'),
  CommunityController.revealIdentity
);

export default router;
