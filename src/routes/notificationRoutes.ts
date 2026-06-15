import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { NotificationController } from '../controllers/NotificationController';

const router = Router();

router.get('/', requireAuth, NotificationController.list);
router.patch('/:id/read', requireAuth, NotificationController.markRead);

export default router;
