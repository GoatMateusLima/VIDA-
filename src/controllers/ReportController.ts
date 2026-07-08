import { Response, NextFunction } from "express";
import { z } from "zod";
import { ReportService } from "../services/ReportService";
import { AuthenticatedRequest } from "../types";

export class ReportController {
  // Criar denúncia contra voluntário/mensagem/comunidade
  static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const schema = z
        .object({
          targetType: z
            .enum(["voluntario", "usuario", "mensagem", "comunidade"])
            .default("usuario"),
          targetId: z.string().uuid("ID inválido").optional(),
          reportedAlias: z.string().trim().min(1).max(100).optional(),
          reason: z.string().min(3, "Defina o motivo da denúncia"),
          description: z.string().optional(),
        })
        .refine((value) => value.targetId || value.reportedAlias, {
          message: "Informe o alvo da denúncia.",
          path: ["targetId"],
        });

      const body = schema.parse(req.body);
      const data = body.targetId
        ? await ReportService.create(
            req.user.id,
            body.targetType,
            body.targetId,
            body.reason,
            body.description,
          )
        : await ReportService.createFromLabel(
            req.user.id,
            body.reportedAlias!,
            body.reason,
            body.description,
          );

      res.status(201).json({
        status: "success",
        message:
          "Sua denúncia foi registrada e será analisada pela equipe técnica administrativa.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Listar denúncias (Apenas Moderador/Admin)
  static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { status } = z
        .object({
          status: z
            .enum(["pendente", "em_analise", "resolvido", "arquivado"])
            .optional(),
        })
        .parse(req.query);
      const data = await ReportService.list(status);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  static async get(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await ReportService.getById(req.params.id);

      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  // Atualizar caso de moderação/denúncia (Apenas Moderador/Admin)
  static async updateCase(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res.status(401).json({ status: "error", message: "Não autenticado" });
        return;
      }

      const { id } = req.params;
      const schema = z.object({
        status: z.enum(["resolvido", "arquivado", "em_analise"]),
        decision: z
          .string()
          .min(5, "Explique a resolução adotada para fins de auditoria"),
      });

      const body = schema.parse(req.body);
      const data = await ReportService.updateCase(
        id,
        req.user.id,
        body.status,
        body.decision,
      );

      res.status(200).json({
        status: "success",
        message: "Denúncia e caso de moderação atualizados com sucesso.",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
