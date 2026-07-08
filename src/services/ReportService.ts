/**
 * VIDA+ - ReportService (Camada de Regras de Negócio - Denúncias e Moderação)
 *
 * Gerencia o fluxo de denúncias de comportamento inadequado na plataforma.
 *
 * Fluxo:
 *   1. Usuário cria uma denúncia via `create` (target pode ser voluntário, usuário, mensagem, etc.)
 *   2. Um caso de moderação é criado automaticamente com status 'aberto'
 *   3. Moderador/Admin lista as denúncias via `list` e analisa cada caso
 *   4. Moderador/Admin atualiza o caso via `updateCase` com decisão e resolução
 *
 * Regra de negócio importante:
 *   Denúncias NÃO geram banimento automático — toda decisão requer análise humana.
 *   Isso garante que ações irreversíveis sejam auditadas e conscientes.
 */

import { supabaseAdmin } from '../config/database';
import { AppError } from '../middlewares/errorMiddleware';
import { AuditService } from './AuditService';

export class ReportService {
  /**
   * Registra uma nova denúncia e cria automaticamente um caso de moderação para análise.
   *
   * @param reporterId  - UUID do usuário que está denunciando
   * @param targetType  - O que está sendo denunciado: 'voluntario' | 'usuario' | 'mensagem' | 'comunidade'
   * @param targetId    - UUID do alvo da denúncia
   * @param reason      - Motivo principal (ex: 'assédio', 'linguagem ofensiva')
   * @param description - Descrição detalhada opcional do ocorrido
   */
  static async create(reporterId: string, targetType: string, targetId: string, reason: string, description?: string) {
    // 1. Cria o registro da denúncia
    const { data: report, error } = await supabaseAdmin
      .from('reports')
      .insert({ reporter_id: reporterId, target_type: targetType, target_id: targetId, reason, description })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao criar denúncia: ' + error.message, 400);
    }

    // 2. Cria automaticamente o caso de moderação associado (status 'aberto')
    // Isso notifica a equipe de moderação que há um caso pendente para análise
    const { error: caseError } = await supabaseAdmin
      .from('moderation_cases')
      .insert({ report_id: report.id, status: 'aberto' });
    if (caseError) {
      await supabaseAdmin.from('reports').delete().eq('id', report.id);
      throw new AppError('Erro ao abrir caso de moderação.', 500);
    }

    return report;
  }

  static async createFromLabel(reporterId: string, targetLabel: string, reason: string, description?: string) {
    const details = [
      `Alvo informado pela interface: ${targetLabel}`,
      description,
    ].filter(Boolean).join('\n\n');

    return this.create(reporterId, 'usuario', reporterId, reason, details);
  }

  /**
   * Lista todas as denúncias com seus respectivos casos de moderação.
   * Disponível apenas para moderadores e administradores.
   *
   * @param status - Filtro opcional por status da denúncia
   */
  static async list(status?: string) {
    let query = supabaseAdmin
      .from('reports')
      .select('*, moderation_cases(*)'); // Join com a tabela de casos

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new AppError('Erro ao listar denúncias: ' + error.message, 400);
    }

    return data;
  }

  static async getById(reportId: string) {
    const { data, error } = await supabaseAdmin
      .from('reports')
      .select('*, moderation_cases(*)')
      .eq('id', reportId)
      .single();

    if (error || !data) {
      throw new AppError('Denuncia nao encontrada', 404);
    }

    return data;
  }

  /**
   * Atualiza o resultado de uma análise de denúncia.
   * Registra quem decidiu, qual foi a decisão e quando foi resolvida.
   * Deixa trilha de auditoria completa para futuras revisões.
   *
   * @param reportId   - UUID da denúncia a ser atualizada
   * @param assignedTo - UUID do moderador/admin que tomou a decisão
   * @param status     - Novo status: 'resolvido' | 'arquivado' | 'em_analise'
   * @param decision   - Texto explicando a decisão tomada (obrigatório para auditoria)
   */
  static async updateCase(reportId: string, assignedTo: string, status: 'resolvido' | 'arquivado' | 'em_analise', decision: string) {
    // 1. Atualiza o caso de moderação com a decisão e o responsável
    const { error: caseErr } = await supabaseAdmin
      .from('moderation_cases')
      .update({
        assigned_to: assignedTo,
        status: status === 'em_analise' ? 'em_analise' : 'resolvido',
        decision,
        resolved_at: status !== 'em_analise' ? new Date().toISOString() : null,
      })
      .eq('report_id', reportId);

    if (caseErr) {
      throw new AppError('Erro ao atualizar caso de moderação: ' + caseErr.message, 400);
    }

    // 2. Sincroniza o status principal da denúncia para refletir a decisão
    const { data: updatedReport, error: reportErr } = await supabaseAdmin
      .from('reports')
      .update({ status })
      .eq('id', reportId)
      .select()
      .single();

    if (reportErr) {
      throw new AppError('Erro ao atualizar denúncia: ' + reportErr.message, 400);
    }

    await AuditService.record(assignedTo, 'report.reviewed', 'report', reportId, { status });
    return updatedReport;
  }
}
