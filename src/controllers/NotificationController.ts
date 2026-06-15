import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { NotificationService } from '../services/NotificationService';

export class NotificationController {
  static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }).parse(req.query);
      const data = await NotificationService.list(req.user.id, query.page, query.limit);
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  static async markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }
      const id = z.string().uuid().parse(req.params.id);
      const data = await NotificationService.markRead(req.user.id, id);
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }
}
