import { Response, NextFunction } from "express";
import { z } from "zod";
import { VolunteerService } from "../services/VolunteerService";
import { AuthenticatedRequest } from "../types";

export class AdminController {
  static async listVolunteers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await VolunteerService.listVolunteers();
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  // Voluntário consulta a própria candidatura (Gap #6)
  static async getMyApplication(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }
      const data = await VolunteerService.getMyApplication(req.user.id);
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  // Obter candidaturas de voluntários (Apenas Admin)
  static async listVolunteerApplications(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { status } = z
        .object({
          status: z.enum(["pendente", "aprovada", "rejeitada"]).optional(),
        })
        .parse(req.query);
      const data = await VolunteerService.listApplications(status);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getVolunteerApplication(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await VolunteerService.getApplication(req.params.id);
      res.status(200).json({ status: "success", data });
    } catch (error) {
      next(error);
    }
  }

  // Candidatar-se a voluntário (Qualquer usuário cadastrado)
  static async applyForVolunteer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const schema = z.object({
        motivation: z
          .string()
          .min(10, "Escreva uma justificativa mais detalhada"),
        experience: z
          .string()
          .min(5, "Descreva sua experiência ou treinamento anterior"),
      });

      const body = schema.parse(req.body);
      const data = await VolunteerService.apply(
        req.user.id,
        body.motivation,
        body.experience,
      );

      res.status(201).json({
        status: "success",
        message: "Candidatura enviada para análise administrativa!",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Aprovar voluntário (Apenas Admin)
  static async approveVolunteer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const { id } = req.params; // ID da candidatura
      const data = await VolunteerService.approveApplication(id, req.user.id);

      res.status(200).json({
        status: "success",
        message: "Candidatura aprovada! O usuário agora é um Voluntário ativo.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async rejectVolunteer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "NÃ£o autenticado" });
        return;
      }

      const body = z
        .object({
          decision: z
            .string()
            .trim()
            .min(5)
            .default("Candidatura rejeitada pela administracao."),
        })
        .parse(req.body);
      const data = await VolunteerService.rejectApplication(
        req.params.id,
        req.user.id,
        body.decision,
      );

      res.status(200).json({
        status: "success",
        message: "Candidatura rejeitada.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Suspender voluntário (Apenas Admin)
  static async suspendVolunteer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { id } = req.params; // ID do voluntário (user_id)
      const data = await VolunteerService.suspendVolunteer(id, req.user?.id);

      res.status(200).json({
        status: "success",
        message: data.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // Voluntário atualiza próprio status de disponibilidade
  static async updateAvailability(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const schema = z.object({
        status: z.enum(["online", "ocupado", "offline"]),
      });

      const body = schema.parse(req.body);
      const data = await VolunteerService.updateStatus(
        req.user.id,
        body.status,
      );

      res.status(200).json({
        status: "success",
        message: "Status atualizado com sucesso.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
