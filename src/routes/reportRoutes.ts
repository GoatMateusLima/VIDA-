/**
 * VIDA+ - Rotas de Denúncias e Moderação
 *
 * Gerencia o sistema de denúncias de comportamento inadequado na plataforma.
 *
 * Rotas acessíveis por qualquer usuário autenticado:
 *   POST /api/reports → Registra uma denúncia (contra voluntário, usuário, mensagem, etc.)
 *
 * Rotas exclusivas para moderadores e administradores:
 *   GET   /api/reports/admin/reports      → Lista todas as denúncias abertas/resolvidas
 *   PATCH /api/reports/admin/reports/:id  → Atualiza análise e decisão de uma denúncia
 *
 * Importante: denúncias NUNCA resultam em banimento automático.
 * Toda ação disciplinar é tomada manualmente por um moderador/administrador
 * após analisar o caso, garantindo rastreabilidade e auditoria completa.
 */

import { Router } from "express";
import { ReportController } from "../controllers/ReportController";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware";

const router = Router();

// Qualquer usuário autenticado pode enviar uma denúncia
router.post("/", requireAuth, ReportController.create);

// Usuário vê as próprias denúncias e acompanha o status
router.get("/my", requireAuth, ReportController.listMine);

// Apenas moderadores e administradores podem acessar a lista e gerenciar casos
router.get(
  "/admin/reports",
  requireAuth,
  requireRoles("moderador", "administrador"),
  ReportController.list,
);
router.get(
  "/admin/reports/:id",
  requireAuth,
  requireRoles("moderador", "administrador"),
  ReportController.get,
);
router.patch(
  "/admin/reports/:id",
  requireAuth,
  requireRoles("moderador", "administrador"),
  ReportController.updateCase,
);

export default router;
