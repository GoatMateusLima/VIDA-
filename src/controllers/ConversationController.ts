import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { ConversationService } from '../services/ConversationService';
import { VolunteerService } from '../services/VolunteerService';
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

  // Enviar mensagem
  static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: 'error', message: 'Não autenticado' });
        return;
      }

      const { id } = req.params;
      const schema = z.object({
        text: z.string().min(1, 'A mensagem não pode ser vazia'),
      });

      const body = schema.parse(req.body);
      const data = await ConversationService.sendMessage(id, req.user.id, body.text);

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
        reason: z.string().min(1, 'O motivo de encerramento é obrigatório'),
      });

      const body = schema.parse(req.body);
      const data = await ConversationService.close(id, req.user.id, body.reason);

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
