import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { ConversationService } from '../services/ConversationService';
import { VolunteerService } from '../services/VolunteerService';
import { PresenceService } from '../services/PresenceService';
import { AuthenticatedRequest } from '../types';

export class ConversationController {
  // Usuário cria atendimento (entra na fila)
  static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const data = await ConversationService.create(req.user.id);
      res.status(201).json({
        status: 'success',
        message: 'Você entrou na fila de atendimento. Um voluntário irá acolher você em breve.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Consultar detalhes de um atendimento específico
  static async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const { id } = req.params;
      const data = await ConversationService.getById(id, req.user.id, req.user.role);

      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async history(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }).parse(req.query);
      const data = await ConversationService.history(
        req.user.id,
        req.user.role,
        query.page,
        query.limit
      );
      res.status(200).json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }

  static async typing(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }
      const { id } = req.params;
      const { typing } = z.object({ typing: z.boolean() }).parse(req.body);
      const alias = req.user.display_name || (req.user.role === 'voluntario' ? 'Voluntário' : 'Pessoa acolhida');

      PresenceService.setTyping('conversation', id, req.user.id, alias, typing);
      res.status(200).json({ status: 'success', data: { typing } });
    } catch (error) {
      next(error);
    }
  }

  static async events(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Não autenticado' });
      return;
    }

    const conversationId = req.params.id;
    const user = req.user;
    let lastTimestamp = typeof req.query.after === 'string' ? req.query.after : undefined;
    let closed = false;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    // Envia mensagens acumuladas desde o último timestamp (se reconectando)
    try {
      const messages = await ConversationService.messagesAfter(
        conversationId,
        user.id,
        user.role,
        lastTimestamp
      );
      for (const message of messages) {
        lastTimestamp = message.created_at;
        res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      }
    } catch (error) {
      // ignora erro no fetch inicial de histórico
    }

    // Registra ouvinte em memória para transmissões em tempo real (mensagens e digitação)
    PresenceService.subscribeConversation(conversationId, res);

    // Heartbeat a cada 20s para manter a conexão ativa sem onerar o banco de dados
    const heartbeat = setInterval(() => {
      if (closed) return;
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      } catch {
        closed = true;
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
    });
  }

  // Enviar mensagem
  static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const { id } = req.params;
      const schema = z.object({
        text: z.string().trim().min(1, 'A mensagem não pode ser vazia').max(4000),
      });

      const body = schema.parse(req.body);
      const data = await ConversationService.sendMessage(id, req.user.id, req.user.role, body.text);

      res.status(201).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Encerrar atendimento
  static async close(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const { id } = req.params;
      const schema = z.object({
        reason: z.string().trim().min(1, 'O motivo de encerramento é obrigatório').max(100),
      });

      const body = schema.parse(req.body);
      const data = await ConversationService.close(id, req.user.id, req.user.role, body.reason);

      res.status(200).json({
        status: 'success',
        message: 'Atendimento encerrado.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Voluntário sinaliza risco
  static async flagRisk(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const { id } = req.params;
      const schema = z.object({
        level: z.enum(['baixo', 'medio', 'alto', 'imediato']),
        reason: z.string().min(5, 'Explique brevemente o motivo da sinalização'),
        actionTaken: z.string().optional(),
      });

      const body = schema.parse(req.body);
      const data = await ConversationService.flagRisk(id, req.user.id, body.level, body.reason, body.actionTaken);

      res.status(201).json({
        status: 'success',
        message: 'Sinalização de risco registrada. Caso necessário, acione o CVV 188 ou o SAMU 192.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Voluntário visualiza fila de espera
  static async getQueue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await ConversationService.getQueue();
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // SSE: notifica o voluntário em tempo real quando a fila muda
  static async queueEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Não autenticado' });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    // Envia snapshot da fila atual assim que o voluntário conecta
    try {
      const currentQueue = await ConversationService.getQueue();
      res.write(`event: queue_snapshot\ndata: ${JSON.stringify(currentQueue)}\n\n`);
    } catch {
      // ignora erro no snapshot inicial
    }

    // Registra como ouvinte de eventos futuros
    PresenceService.subscribeQueue(res);

    // Heartbeat a cada 20s para manter conexão viva
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  // Voluntário assume/aceita atendimento
  static async accept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const { id } = req.params;
      const data = await ConversationService.accept(id, req.user.id);

      res.status(200).json({
        status: 'success',
        message: 'Você assumiu o atendimento.',
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Obter resumo operacional do voluntário (dashboard)
  static async getDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await VolunteerService.getDashboardData();
      res.status(200).json({
        status: 'success',
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
