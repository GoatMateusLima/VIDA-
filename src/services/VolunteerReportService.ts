import { supabaseAdmin } from "../config/database";
import { AppError } from "../middlewares/errorMiddleware";

export class VolunteerReportService {
  static async create(
    volunteerId: string,
    title: string,
    description: string,
    targetUserId?: string,
    conversationId?: string,
  ) {
    const { data, error } = await supabaseAdmin
      .from("volunteer_reports")
      .insert({
        volunteer_id: volunteerId,
        target_user_id: targetUserId || null,
        conversation_id: conversationId || null,
        title,
        description,
        status: "pendente",
      })
      .select()
      .single();

    if (error) {
      throw new AppError("Erro ao criar relatório de voluntário: " + error.message, 400);
    }
    return data;
  }

  static async listForVolunteer(volunteerId: string) {
    const { data, error } = await supabaseAdmin
      .from("volunteer_reports")
      .select("*, users:target_user_id(display_name)")
      .eq("volunteer_id", volunteerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError("Erro ao listar relatórios: " + error.message, 400);
    }

    return (data || []).map((r: any) => ({
      ...r,
      target_user_name: r.users?.display_name || null,
    }));
  }

  static async listAllForAdmin() {
    const { data, error } = await supabaseAdmin
      .from("volunteer_reports")
      .select("*, volunteer:volunteer_id(display_name), target:target_user_id(display_name)")
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError("Erro ao listar relatórios para administração: " + error.message, 400);
    }

    return (data || []).map((r: any) => ({
      ...r,
      volunteer_name: r.volunteer?.display_name || "Voluntário",
      target_user_name: r.target?.display_name || null,
    }));
  }

  static async respondToReport(reportId: string, adminFeedback: string) {
    const { data, error } = await supabaseAdmin
      .from("volunteer_reports")
      .update({
        status: "respondido",
        admin_feedback: adminFeedback,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reportId)
      .select()
      .single();

    if (error) {
      throw new AppError("Erro ao responder ao relatório: " + error.message, 400);
    }

    return data;
  }
}
