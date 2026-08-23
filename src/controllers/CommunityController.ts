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

  static async presence(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }
      const communityId = req.params.id;
      const { alias } = z.object({ alias: z.string().optional() }).parse(req.body || {});
      const userAlias = alias || req.user.display_name || 'Participante';

      PresenceService.recordHeartbeat(req.user.id, userAlias, req.user.role, { communityId });
      const onlineUsers = PresenceService.getCommunityOnlineUsers(communityId);
      res.status(200).json({
        status: 'success',
        data: {
          onlineCount: onlineUsers.length,
          users: onlineUsers,
        },
      });
    } catch (error) { next(error); }
  }

  static async onlineUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.id;
      const onlineUsers = PresenceService.getCommunityOnlineUsers(communityId);
      res.status(200).json({
        status: 'success',
        data: {
          onlineCount: onlineUsers.length,
          users: onlineUsers,
        },
      });
    } catch (error) { next(error); }
  }

  static async typing(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }
      const communityId = req.params.id;
      const { typing, alias } = z.object({
        typing: z.boolean(),
        alias: z.string().optional(),
      }).parse(req.body);
      const userAlias = alias || req.user.display_name || 'Participante';

      PresenceService.setTyping('community', communityId, req.user.id, userAlias, typing);
      res.status(200).json({ status: 'success', data: { typing } });
    } catch (error) { next(error); }
  }

  static async events(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Não autenticado' });
      return;
    }

    const communityId = req.params.id;
    const user = req.user;
    const userAlias = typeof req.query.alias === 'string' ? req.query.alias : (user.display_name || 'Participante');

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    // Registra presença e assina no PresenceService
    PresenceService.recordHeartbeat(user.id, userAlias, user.role, { communityId });
    PresenceService.subscribeCommunity(communityId, res);

    // Envia dados iniciais de presença e digitação
    const onlineUsers = PresenceService.getCommunityOnlineUsers(communityId);
    res.write(`event: presence\ndata: ${JSON.stringify({ onlineCount: onlineUsers.length, users: onlineUsers })}\n\n`);

    const typingUsers = PresenceService.getTypingUsers('community', communityId, user.id);
    if (typingUsers.length > 0) {
      res.write(`event: typing\ndata: ${JSON.stringify({ typing: true, typingUsers, alias: typingUsers[0].alias })}\n\n`);
    }

    const interval = setInterval(() => {
      try {
        PresenceService.recordHeartbeat(user.id, userAlias, user.role, { communityId });
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      } catch {
        clearInterval(interval);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      PresenceService.removeUser(user.id);
    });
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
