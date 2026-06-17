import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { CommunityService } from '../services/CommunityService';

export class CommunityController {
  static async adminList(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await CommunityService.adminList();
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async adminDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await CommunityService.adminDetail(req.params.id, req.user!.id);
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async adminCreate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = z.object({
        name: z.string().trim().min(3).max(100),
        description: z.string().trim().max(1000).optional(),
        rules: z.array(z.string().trim().min(3).max(300)).max(20).default([]),
      }).parse(req.body);
      const data = await CommunityService.adminCreate(req.user!.id, body);
      res.status(201).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async adminUpdate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = z.object({
        name: z.string().trim().min(3).max(100).optional(),
        description: z.string().trim().max(1000).optional(),
        rules: z.array(z.string().trim().min(3).max(300)).max(20).optional(),
        status: z.enum(['ativo', 'pausado', 'arquivado']).optional(),
      }).refine((value) => Object.keys(value).length > 0).parse(req.body);
      const data = await CommunityService.adminUpdate(req.params.id, req.user!.id, body);
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async adminUpdateMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status } = z.object({
        status: z.enum(['ativo', 'removido']),
      }).parse(req.body);
      const data = await CommunityService.adminUpdateMember(
        req.params.id,
        req.params.userId,
        req.user!.id,
        status
      );
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async adminDeleteMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { reason } = z.object({
        reason: z.string().trim().min(10).max(500),
      }).parse(req.body);
      const data = await CommunityService.adminDeleteMessage(
        req.params.messageId,
        req.user!.id,
        reason
      );
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await CommunityService.list(req.user?.id);
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async join(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await CommunityService.join(req.params.id, req.user!.id);
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async leave(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await CommunityService.leave(req.params.id, req.user!.id);
      res.status(200).json({ status: 'success', message: 'Você saiu do grupo.' });
    } catch (error) { next(error); }
  }

  static async messages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(req.query);
      const data = await CommunityService.messages(req.params.id, req.user!.id, query.page, query.limit);
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async send(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { text } = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body);
      const data = await CommunityService.send(req.params.id, req.user!.id, text);
      res.status(201).json({ status: 'success', data });
    } catch (error) { next(error); }
  }

  static async revealIdentity(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { reason } = z.object({ reason: z.string().trim().min(10).max(500) }).parse(req.body);
      const data = await CommunityService.revealIdentity(
        req.params.messageId,
        req.user!.id,
        req.user!.role,
        reason
      );
      res.status(200).json({ status: 'success', data });
    } catch (error) { next(error); }
  }
}
