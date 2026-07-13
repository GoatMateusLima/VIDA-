/**
 * VIDA+ - Rotas Administrativas e de Voluntariado
 *
 * Gerencia o ciclo completo de candidatura e gestão de voluntários.
 *
 * Acessível por qualquer usuário autenticado:
 *   POST /api/admin/volunteers/apply → Usuário envia candidatura para ser voluntário
 *
 * Exclusivo para voluntários, moderadores e administradores:
 *   PATCH /api/admin/volunteers/availability → Voluntário atualiza seu status (online/ocupado/offline)
 *
 * Exclusivo para administradores:
 *   GET  /api/admin/volunteers/applications   → Lista candidaturas (com filtro por status)
 *   POST /api/admin/volunteers/:id/approve    → Aprova candidatura e eleva usuário a voluntário
 *   POST /api/admin/volunteers/:id/suspend    → Suspende voluntário e revoga permissões
 *
 * Nota: a rota /availability usa PATCH pois atualiza apenas um campo do recurso.
 * As rotas /approve e /suspend usam POST pois representam ações, não atualizações parciais.
 */

import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { requireAuth, requireRoles } from "../middlewares/authMiddleware";

const router = Router();

router.get(
  "/volunteers",
  requireAuth,
  requireRoles("administrador"),
  AdminController.listVolunteers,
);

// ─── Candidatura (qualquer usuário autenticado) ───────────────────────────────
router.post(
  "/volunteers/apply",
  requireAuth,
  AdminController.applyForVolunteer,
);

// ─── Voluntário consulta a própria candidatura ────────────────────────────────
router.get(
  "/volunteers/applications/me",
  requireAuth,
  AdminController.getMyApplication,
);

// ─── Atualização de disponibilidade (somente voluntários+) ───────────────────
router.patch(
  "/volunteers/availability",
  requireAuth,
  requireRoles("voluntario", "moderador", "administrador"),
  AdminController.updateAvailability,
);

// ─── Gestão administrativa (somente administradores) ─────────────────────────
router.get(
  "/volunteers/applications",
  requireAuth,
  requireRoles("administrador"),
  AdminController.listVolunteerApplications,
);
router.get(
  "/volunteers/applications/:id",
  requireAuth,
  requireRoles("administrador"),
  AdminController.getVolunteerApplication,
);
router.post(
  "/volunteers/:id/approve",
  requireAuth,
  requireRoles("administrador"),
  AdminController.approveVolunteer,
);
router.post(
  "/volunteers/:id/reject",
  requireAuth,
  requireRoles("administrador"),
  AdminController.rejectVolunteer,
);
router.post(
  "/volunteers/:id/suspend",
  requireAuth,
  requireRoles("administrador"),
  AdminController.suspendVolunteer,
);

export default router;
