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

import { supabaseAdmin } from '../config/database';
import { AppError } from '../middlewares/errorMiddleware';
import { AuditService } from './AuditService';

export class VolunteerService {
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
      .from('volunteer_applications')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['pendente', 'aprovada'])
      .maybeSingle();
    if (existing) {
      throw new AppError('Você já possui uma candidatura ativa.', 409);
    }

    const { data, error } = await supabaseAdmin
      .from('volunteer_applications')
      .insert({ user_id: userId, status: 'pendente', motivation, experience })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao enviar candidatura: ' + error.message, 400);
    }

    return data;
  }

  /**
   * Lista todas as candidaturas, opcionalmente filtradas por status.
   * Inclui dados do usuário (display_name) via join.
   *
   * @param status - Filtro opcional: 'pendente' | 'aprovada' | 'rejeitada'
   */
  static async listApplications(status?: 'pendente' | 'aprovada' | 'rejeitada') {
    let query = supabaseAdmin
      .from('volunteer_applications')
      .select('*, users(display_name, status)');

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new AppError('Erro ao listar candidaturas: ' + error.message, 400);
    }

    return data;
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
      .from('volunteer_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !app) {
      throw new AppError('Candidatura não encontrada', 404);
    }
    if (app.status !== 'pendente') {
      throw new AppError('Esta candidatura já foi analisada.', 409);
    }

    // 2. Marca a candidatura como aprovada com quem aprovou e quando
    const { error: updateAppErr } = await supabaseAdmin
      .from('volunteer_applications')
      .update({ status: 'aprovada', reviewer_id: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', applicationId);

    if (updateAppErr) {
      throw new AppError('Erro ao atualizar candidatura: ' + updateAppErr.message, 400);
    }

    // 3. Eleva o cargo do usuário para 'voluntario' na tabela public.users
    const { error: userUpdateErr } = await supabaseAdmin
      .from('users')
      .update({ role: 'voluntario' })
      .eq('id', app.user_id);

    if (userUpdateErr) {
      throw new AppError('Erro ao atualizar permissão do usuário: ' + userUpdateErr.message, 400);
    }

    // 4. Cria o perfil de voluntário (começa offline, nível de risco baixo)
    const { data: volProfile, error: volErr } = await supabaseAdmin
      .from('volunteer_profiles')
      .insert({ user_id: app.user_id, availability_status: 'offline', training_status: 'concluido', risk_level_allowed: 'baixo' })
      .select()
      .single();

    if (volErr) {
      throw new AppError('Erro ao criar perfil de voluntário: ' + volErr.message, 400);
    }

    await AuditService.record(reviewerId, 'volunteer.approved', 'volunteer_application', applicationId, {
      user_id: app.user_id,
    });
    return volProfile;
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
      .from('users')
      .update({ role: 'cadastrado' })
      .eq('id', volunteerId);

    if (userUpdateErr) {
      throw new AppError('Erro ao suspender voluntário: ' + userUpdateErr.message, 400);
    }

    // Remove o perfil de voluntário (o usuário não aparece mais na lista de disponíveis)
    const { error: volDelErr } = await supabaseAdmin
      .from('volunteer_profiles')
      .delete()
      .eq('user_id', volunteerId);

    if (volDelErr) {
      throw new AppError('Erro ao remover perfil de voluntário: ' + volDelErr.message, 400);
    }

    await AuditService.record(actorId, 'volunteer.suspended', 'user', volunteerId);
    return { message: 'Voluntário suspenso com sucesso.' };
  }

  /**
   * Atualiza o status de disponibilidade do próprio voluntário.
   * O status é visível para o sistema de atribuição de atendimentos.
   *
   * @param volunteerId - UUID do voluntário
   * @param status      - Novo status: 'online' | 'ocupado' | 'offline'
   */
  static async updateStatus(volunteerId: string, status: 'online' | 'ocupado' | 'offline') {
    const { data, error } = await supabaseAdmin
      .from('volunteer_profiles')
      .update({ availability_status: status })
      .eq('user_id', volunteerId)
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao atualizar status de disponibilidade: ' + error.message, 400);
    }

    return data;
  }

  /**
   * Retorna métricas resumidas para o dashboard operacional do voluntário.
   * Usa COUNT para evitar trazer dados desnecessários da rede.
   */
  static async getDashboardData() {
    // Conta atendimentos aguardando na fila
    const { count: pendingChats } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'aguardando');

    // Conta atendimentos em andamento
    const { count: activeChats } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativa');

    // Conta voluntários online no momento
    const { count: onlineVolunteers } = await supabaseAdmin
      .from('volunteer_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('availability_status', 'online');

    return {
      pendingChats: pendingChats || 0,
      activeChats: activeChats || 0,
      onlineVolunteers: onlineVolunteers || 0,
    };
  }
}
