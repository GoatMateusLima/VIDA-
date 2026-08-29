/**
 * VIDA+ - VolunteerService (Camada de Regras de Negócio - Voluntários)
 *
 * Gerencia todo o ciclo de vida dos voluntários na plataforma:
 *   1. Candidatura → Aprovação → Perfil ativo → Disponibilidade → Atendimentos
 *
 * Responsabilidades:
 *   - Submissão e listagem de candidaturas de voluntários
 *   - Aprovação: atualiza o cargo do usuário para 'voluntario' e cria perfil
 *   - Suspensão: reverte cargo para 'cadastrado' e remove perfil de voluntário
 *   - Atualização de status de disponibilidade (online/ocupado/offline)
 *   - Dados resumidos para o dashboard operacional do voluntário
 *
 * Todas as operações usam `supabaseAdmin` pois alteram dados privilegiados (roles).
 */

import { supabaseAdmin } from "../config/database";
import { AppError } from "../middlewares/errorMiddleware";
import { AuditService } from "./AuditService";

export class VolunteerService {
  private static readonly MODERATOR_PREFIX = "[MODERADOR] ";

  static async applyForModerator(userId: string, motivation: string, experience: string) {
    const { data: user } = await supabaseAdmin.from("users").select("role").eq("id", userId).single();
    if (user?.role !== "voluntario") throw new AppError("Somente voluntários podem se candidatar a moderador.", 403);
    const { data: existing } = await supabaseAdmin
      .from("volunteer_applications").select("id, status").eq("user_id", userId)
      .like("motivation", `${this.MODERATOR_PREFIX}%`).in("status", ["pendente", "aprovada"]).maybeSingle();
    if (existing) throw new AppError("Você já possui uma candidatura para moderador ativa.", 409);
    const { data, error } = await supabaseAdmin.from("volunteer_applications").insert({
      user_id: userId,
      status: "pendente",
      motivation: `${this.MODERATOR_PREFIX}${motivation}`,
      experience,
    }).select().single();
    if (error) throw new AppError("Erro ao enviar candidatura para moderador: " + error.message, 400);
    return this.normalizeModeratorApplication(data);
  }

  static async listModeratorApplications() {
    const { data, error } = await supabaseAdmin.from("volunteer_applications")
      .select("*, users:user_id(display_name, status)").like("motivation", `${this.MODERATOR_PREFIX}%`)
      .order("created_at", { ascending: false });
    if (error) throw new AppError("Erro ao listar candidaturas para moderador.", 400);
    return (data || []).map((item) => this.normalizeModeratorApplication(parseApplicationFields(item)));
  }

  static async getMyModeratorApplication(userId: string) {
    const { data, error } = await supabaseAdmin.from("volunteer_applications")
      .select("*, users:user_id(display_name, status)").eq("user_id", userId)
      .like("motivation", `${this.MODERATOR_PREFIX}%`).order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (error || !data) throw new AppError("Candidatura para moderador não encontrada.", 404);
    return this.normalizeModeratorApplication(parseApplicationFields(data));
  }

  static async getModeratorApplication(applicationId: string) {
    const { data, error } = await supabaseAdmin.from("volunteer_applications")
      .select("*, users:user_id(display_name, status)").eq("id", applicationId)
      .like("motivation", `${this.MODERATOR_PREFIX}%`).single();
    if (error || !data) throw new AppError("Candidatura para moderador não encontrada.", 404);
    return this.normalizeModeratorApplication(parseApplicationFields(data));
  }

  static async approveModeratorApplication(applicationId: string, reviewerId: string) {
    const { data: app } = await supabaseAdmin.from("volunteer_applications").select("*")
      .eq("id", applicationId).like("motivation", `${this.MODERATOR_PREFIX}%`).single();
    if (!app) throw new AppError("Candidatura para moderador não encontrada.", 404);
    if (app.status !== "pendente") throw new AppError("Esta candidatura já foi analisada.", 409);
    const { data: candidate } = await supabaseAdmin.from("users").select("role").eq("id", app.user_id).single();
    if (candidate?.role !== "voluntario") throw new AppError("O candidato não é um voluntário ativo.", 409);
    const { error: appError } = await supabaseAdmin.from("volunteer_applications").update({
      status: "aprovada", reviewer_id: reviewerId, reviewed_at: new Date().toISOString(),
    }).eq("id", applicationId);
    if (appError) throw new AppError("Erro ao aprovar candidatura.", 400);
    const { data, error } = await supabaseAdmin.from("users").update({ role: "moderador" })
      .eq("id", app.user_id).select().single();
    if (error) throw new AppError("Erro ao promover voluntário para moderador.", 400);
    await AuditService.record(reviewerId, "moderator.approved", "volunteer_application", applicationId, { user_id: app.user_id });
    return data;
  }

  private static normalizeModeratorApplication(app: any) {
    return { ...app, motivation: String(app.motivation || "").replace(this.MODERATOR_PREFIX, ""), application_type: "moderador" };
  }

  static async listVolunteers() {
    const { data, error } = await supabaseAdmin
      .from("volunteer_profiles")
      .select(
        "user_id, availability_status, training_status, total_chats, approved_at, users:user_id(display_name, status)",
      )
      .order("approved_at", { ascending: false });

    if (error) {
      throw new AppError("Erro ao listar voluntarios: " + error.message, 400);
    }

    return data || [];
  }

  /**
   * Registra a candidatura de um usuário para se tornar voluntário.
   * A candidatura fica com status 'pendente' até ser revisada por um administrador.
   *
   * @param userId     - UUID do usuário que está se candidatando
   * @param motivation - Texto motivacional do candidato
   * @param experience - Experiências ou treinamentos anteriores
   */
  static async apply(userId: string, motivation: string, experience: string) {
    const { data: existing } = await supabaseAdmin
      .from("volunteer_applications")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["pendente", "aprovada"])
      .maybeSingle();
    if (existing) {
      throw new AppError("Você já possui uma candidatura ativa.", 409);
    }

    const { data, error } = await supabaseAdmin
      .from("volunteer_applications")
      .insert({ user_id: userId, status: "pendente", motivation, experience })
      .select()
      .single();

    if (error) {
      throw new AppError("Erro ao enviar candidatura: " + error.message, 400);
    }

    return data;
  }

  /**
   * Lista todas as candidaturas, opcionalmente filtradas por status.
   * Inclui dados do usuário (display_name) via join.
   * O campo `availability` é extraído do campo `experience` se presente.
   *
   * @param status - Filtro opcional: 'pendente' | 'aprovada' | 'rejeitada'
   */
  static async listApplications(
    status?: "pendente" | "aprovada" | "rejeitada",
  ) {
    let query = supabaseAdmin
      .from("volunteer_applications")
      .select("*, users:user_id(display_name, status)")
      .not("motivation", "like", `${this.MODERATOR_PREFIX}%`);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      throw new AppError("Erro ao listar candidaturas: " + error.message + " | code: " + error.code, 400);
    }

    return (data || []).map(parseApplicationFields);
  }

  static async getMyApplication(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("volunteer_applications")
      .select("*, users:user_id(display_name, status)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new AppError("Erro ao buscar candidatura: " + error.message, 400);
    }
    if (!data) {
      throw new AppError("Candidatura não encontrada", 404);
    }

    return parseApplicationFields(data);
  }

  static async getApplication(applicationId: string) {
    const { data, error } = await supabaseAdmin
      .from("volunteer_applications")
      .select("*, users:user_id(display_name, status)")
      .eq("id", applicationId)
      .single();

    if (error || !data) {
      throw new AppError("Candidatura nao encontrada", 404);
    }

    return parseApplicationFields(data);
  }

  /**
   * Aprova uma candidatura e eleva o usuário ao cargo de voluntário.
   * Executa 3 operações em sequência:
   *   1. Atualiza o status da candidatura para 'aprovada'
   *   2. Muda o role do usuário de 'cadastrado' → 'voluntario'
   *   3. Cria o registro na tabela volunteer_profiles
   *
   * @param applicationId - UUID da candidatura a ser aprovada
   * @param reviewerId    - UUID do administrador que está aprovando
   */
  static async approveApplication(applicationId: string, reviewerId: string) {
    // 1. Busca a candidatura para obter o user_id do candidato
    const { data: app, error: appError } = await supabaseAdmin
      .from("volunteer_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      throw new AppError("Candidatura não encontrada", 404);
    }
    if (String(app.motivation || "").startsWith(this.MODERATOR_PREFIX)) {
      throw new AppError("Use o fluxo de aprovação de moderadores.", 409);
    }
    if (app.status !== "pendente") {
      throw new AppError("Esta candidatura já foi analisada.", 409);
    }

    // 2. Marca a candidatura como aprovada com quem aprovou e quando
    const { error: updateAppErr } = await supabaseAdmin
      .from("volunteer_applications")
      .update({
        status: "aprovada",
        reviewer_id: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (updateAppErr) {
      throw new AppError(
        "Erro ao atualizar candidatura: " + updateAppErr.message,
        400,
      );
    }

    // 3. Eleva o cargo do usuário para 'voluntario' na tabela public.users
    const { error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({ role: "voluntario" })
      .eq("id", app.user_id);

    if (userUpdateErr) {
      throw new AppError(
        "Erro ao atualizar permissão do usuário: " + userUpdateErr.message,
        400,
      );
    }

    // 4. Cria o perfil de voluntário (começa offline, nível de risco baixo)
    const { data: volProfile, error: volErr } = await supabaseAdmin
      .from("volunteer_profiles")
      .insert({
        user_id: app.user_id,
        availability_status: "offline",
        training_status: "concluido",
        risk_level_allowed: "baixo",
      })
      .select()
      .single();

    if (volErr) {
      throw new AppError(
        "Erro ao criar perfil de voluntário: " + volErr.message,
        400,
      );
    }

    await AuditService.record(
      reviewerId,
      "volunteer.approved",
      "volunteer_application",
      applicationId,
      {
        user_id: app.user_id,
      },
    );
    return volProfile;
  }

  static async rejectApplication(
    applicationId: string,
    reviewerId: string,
    decision: string,
  ) {
    const { data: app, error: appError } = await supabaseAdmin
      .from("volunteer_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      throw new AppError("Candidatura nao encontrada", 404);
    }
    if (app.status !== "pendente") {
      throw new AppError("Esta candidatura ja foi analisada.", 409);
    }

    const { data, error } = await supabaseAdmin
      .from("volunteer_applications")
      .update({
        status: "rejeitada",
        reviewer_id: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", applicationId)
      .select()
      .single();

    if (error || !data) {
      throw new AppError("Erro ao rejeitar candidatura.", 400);
    }

    await AuditService.record(
      reviewerId,
      "volunteer.rejected",
      "volunteer_application",
      applicationId,
      {
        user_id: app.user_id,
        decision,
      },
    );
    return data;
  }

  /**
   * Suspende um voluntário, revertendo seu cargo e removendo seu perfil.
   * O histórico de candidatura não é apagado para fins de auditoria.
   *
   * @param volunteerId - UUID do voluntário a ser suspenso
   */
  static async suspendVolunteer(volunteerId: string, actorId?: string) {
    // Reverte o cargo para 'cadastrado'
    const { error: userUpdateErr } = await supabaseAdmin
      .from("users")
      .update({ role: "cadastrado" })
      .eq("id", volunteerId);

    if (userUpdateErr) {
      throw new AppError(
        "Erro ao suspender voluntário: " + userUpdateErr.message,
        400,
      );
    }

    // Remove o perfil de voluntário (o usuário não aparece mais na lista de disponíveis)
    const { error: volDelErr } = await supabaseAdmin
      .from("volunteer_profiles")
      .delete()
      .eq("user_id", volunteerId);

    if (volDelErr) {
      throw new AppError(
        "Erro ao remover perfil de voluntário: " + volDelErr.message,
        400,
      );
    }

    await AuditService.record(
      actorId,
      "volunteer.suspended",
      "user",
      volunteerId,
    );
    return { message: "Voluntário suspenso com sucesso." };
  }

  /**
   * Atualiza o status de disponibilidade do próprio voluntário.
   * O status é visível para o sistema de atribuição de atendimentos.
   *
   * @param volunteerId - UUID do voluntário
   * @param status      - Novo status: 'online' | 'ocupado' | 'offline'
   */
  static async updateStatus(
    volunteerId: string,
    status: "online" | "ocupado" | "offline",
  ) {
    const { data, error } = await supabaseAdmin
      .from("volunteer_profiles")
      .upsert({
        user_id: volunteerId,
        availability_status: status
      })
      .select()
      .single();

    if (error) {
      throw new AppError(
        "Erro ao atualizar status de disponibilidade: " + error.message,
        400,
      );
    }

    return data;
  }

  /**
   * Retorna métricas resumidas para o dashboard operacional do voluntário/admin.
   * Gap #4 — inclui campos completos esperados pelo frontend:
   *   onlineVolunteers, ativas, total, totalUsersAllTime, satisfactionRate, weeklyConversations
   */
  static async getDashboardData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Conta atendimentos aguardando na fila
    const { count: pendingChats } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "aguardando");

    // Conta atendimentos ativos (ativas)
    const { count: activeChats } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "ativa");

    // Conta total de conversas criadas hoje
    const { count: conversationsToday } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO);

    // Conta total de conversas encerradas
    const { count: encerradas } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "encerrada");

    // Conta voluntários online no momento
    const { count: onlineVolunteers } = await supabaseAdmin
      .from("volunteer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("availability_status", "online");

    // Conta total de usuários cadastrados (todos os tempos)
    const { count: totalUsersAllTime } = await supabaseAdmin
      .from("users")
      .select("*", { count: "exact", head: true });

    // Dados semanais: últimos 7 dias
    const weeklyConversations = await buildWeeklyData();

    return {
      // Campos mapeados pelo frontend (dashboard admin)
      ativas: activeChats || 0,
      total: conversationsToday || 0,
      encerradas: encerradas || 0,
      onlineVolunteers: onlineVolunteers || 0,
      pendingChats: pendingChats || 0,
      totalUsersAllTime: totalUsersAllTime || 0,
      satisfactionRate: 0,          // Não implementado ainda — frontend aceita 0
      weeklyConversations,
      // Aliases de compatibilidade
      pendingChats_alias: pendingChats || 0,
      activeChats: activeChats || 0,
    };
  }
}

// ─── Helper: normaliza campos de candidatura para o formato esperado pelo frontend
function parseApplicationFields(app: any) {
  return {
    ...app,
    // Garante que o display_name do usuário fica no nível raiz
    display_name: app.users?.display_name ?? null,
    user_status: app.users?.status ?? null,
  };
}

// ─── Helper: agrega conversas por dia nos últimos 7 dias ─────────────────────
async function buildWeeklyData() {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const result = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const { count } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', date.toISOString())
      .lt('created_at', nextDate.toISOString());

    result.push({
      day: days[date.getDay()],
      conversations: count || 0,
    });
  }

  return result;
}
