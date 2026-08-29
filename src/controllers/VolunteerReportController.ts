import { Response, NextFunction } from "express";
import { z } from "zod";
import { VolunteerReportService } from "../services/VolunteerReportService";
import { AuthenticatedRequest } from "../types";

export class VolunteerReportController {
  static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const schema = z.object({
        title: z.string().min(5, "O assunto deve ter pelo menos 5 caracteres").max(150),
        description: z.string().min(10, "A descrição deve ter pelo menos 10 caracteres"),
        targetUserId: z.string().uuid("ID de usuário inválido").optional().nullable(),
        conversationId: z.string().uuid("ID de conversa inválido").optional().nullable(),
      });

      const body = schema.parse(req.body);
      const data = await VolunteerReportService.create(
        req.user.id,
        body.title,
        body.description,
        body.targetUserId || undefined,
        body.conversationId || undefined,
      );

      res.status(201).json({
        status: "success",
        message: "Relatório enviado com sucesso à equipe de administração.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listMine(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const data = await VolunteerReportService.listForVolunteer(req.user.id);
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  static async listAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await VolunteerReportService.listAllForAdmin();
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  static async respond(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const schema = z.object({
        adminFeedback: z.string().min(5, "O parecer deve ter pelo menos 5 caracteres"),
      });

      const body = schema.parse(req.body);
      const data = await VolunteerReportService.respondToReport(id, body.adminFeedback);

      res.status(200).json({
        status: "success",
        message: "Parecer do relatório registrado com sucesso.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
