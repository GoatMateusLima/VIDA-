/**
 * VIDA+ - ConversationService (Camada de Regras de Negócio - Atendimentos)
 *
 * O coração da plataforma: gerencia o ciclo completo de um atendimento emocional.
 *
 * Fluxo de um atendimento:
 *   1. Usuário chama `create` → conversa criada com status 'aguardando'
 *   2. Voluntário vê na fila (`getQueue`) e chama `accept` → status vira 'ativa'
 *   3. Mensagens são enviadas com `sendMessage` (criptografadas antes de salvar)
 *   4. Voluntário pode chamar `flagRisk` se identificar sinais de risco
 *   5. Qualquer participante pode chamar `close` para encerrar o atendimento
 *
 * Segurança aplicada:
 *   - `getById` verifica se o solicitante é participante ou privilegiado antes de retornar dados
 *   - Mensagens são descriptografadas apenas na leitura (o banco nunca tem o texto puro)
 *   - `accept` valida que a conversa ainda está 'aguardando' antes de atribuir
 */

import { supabaseAdmin } from '../config/database';
import { AppError } from '../middlewares/errorMiddleware';
import { encryptMessage, decryptMessage } from '../utils/helpers';

export class ConversationService {
  /**
   * Cria um novo atendimento para o usuário (entra na fila de espera).
   * Verifica se já existe um atendimento ativo ou aguardando para evitar duplicatas.
   *
   * @param userId - UUID do usuário que quer atendimento
   */
  static async create(userId: string) {
    // Impede que o usuário entre na fila duas vezes
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['aguardando', 'ativa'])
      .maybeSingle();

    if (existing) {
      throw new AppError('Você já possui um atendimento ativo ou aguardando na fila.', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({ user_id: userId, status: 'aguardando', priority: 'normal' })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao iniciar atendimento: ' + error.message, 400);
    }

    return data;
  }

  /**
   * Retorna os detalhes de um atendimento, incluindo as mensagens descriptografadas.
   * Valida o controle de acesso antes de retornar qualquer dado.
   *
   * @param conversationId - UUID da conversa
   * @param userId         - UUID de quem está fazendo a requisição
   * @param role           - Cargo do solicitante (para verificar acesso privilegiado)
   */
  static async getById(conversationId: string, userId: string, role: string) {
    const { data: conversation, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error || !conversation) {
      throw new AppError('Atendimento não encontrado', 404);
    }

    // Controle de acesso: só participantes diretos ou papéis privilegiados podem ver
    const isParticipant = conversation.user_id === userId;
    const isAssignedVolunteer = conversation.volunteer_id === userId;
    const isPrivileged = ['voluntario', 'moderador', 'administrador'].includes(role);

    if (!isParticipant && !isAssignedVolunteer && !isPrivileged) {
      throw new AppError('Você não tem permissão para acessar este atendimento.', 403);
    }

    // Busca mensagens e descriptografa o conteúdo para exibição
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    const decryptedMessages = (messages || []).map((msg) => ({
      ...msg,
      body: decryptMessage(msg.body_encrypted), // Texto legível para o frontend
    }));

    return { ...conversation, messages: decryptedMessages };
  }

  /**
   * Envia uma mensagem em um atendimento ativo.
   * O texto é criptografado antes de ser salvo — o banco nunca armazena texto puro.
   *
   * @param conversationId - UUID da conversa
   * @param senderId       - UUID do remetente
   * @param text           - Texto original da mensagem
   */
  static async sendMessage(conversationId: string, senderId: string, text: string) {
    // Valida que a conversa está ativa antes de permitir envio
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw new AppError('Atendimento não encontrado.', 404);
    }

    if (conversation.status !== 'ativa') {
      throw new AppError('Você só pode enviar mensagens em conversas ativas.', 400);
    }

    // Criptografa o conteúdo antes de persistir
    const bodyEncrypted = encryptMessage(text);

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, body_encrypted: bodyEncrypted, type: 'text' })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao enviar mensagem: ' + error.message, 400);
    }

    // Retorna com o texto original descriptografado para o frontend exibir imediatamente
    return { ...data, body: text };
  }

  /**
   * Encerra um atendimento, registrando o motivo do encerramento.
   *
   * @param conversationId - UUID da conversa a encerrar
   * @param userId         - UUID de quem está encerrando
   * @param closedReason   - Ex: 'usuario_encerrou', 'voluntario_encerrou'
   */
  static async close(conversationId: string, userId: string, closedReason: string) {
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw new AppError('Atendimento não encontrado.', 404);
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ status: 'encerrada', ended_at: new Date().toISOString(), closed_reason: closedReason, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao encerrar atendimento: ' + error.message, 400);
    }

    return data;
  }

  /**
   * Voluntário assume um atendimento da fila de espera.
   * Valida que a conversa ainda está 'aguardando' para evitar conflito entre voluntários.
   *
   * @param conversationId - UUID da conversa a ser aceita
   * @param volunteerId    - UUID do voluntário que está assumindo
   */
  static async accept(conversationId: string, volunteerId: string) {
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw new AppError('Atendimento não encontrado.', 404);
    }

    // Previne dupla atribuição (race condition entre voluntários)
    if (conversation.status !== 'aguardando') {
      throw new AppError('Esta conversa já foi assumida ou foi encerrada.', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ status: 'ativa', volunteer_id: volunteerId, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao aceitar atendimento: ' + error.message, 400);
    }

    return data;
  }

  /**
   * Retorna a lista de atendimentos aguardando na fila (ordenados por chegada).
   * Inclui o display_name do usuário via join para o dashboard do voluntário.
   */
  static async getQueue() {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*, users(display_name)')
      .eq('status', 'aguardando')
      .order('created_at', { ascending: true }); // FIFO: primeiro que chegou, primeiro atendido

    if (error) {
      throw new AppError('Erro ao buscar fila de atendimento: ' + error.message, 400);
    }

    return data;
  }

  /**
   * Registra uma sinalização de risco operacional identificada pelo voluntário.
   * Atualiza o status e a prioridade do atendimento conforme o nível do risco.
   * NÃO é um diagnóstico — é um registro operacional para acompanhamento.
   *
   * @param conversationId - UUID da conversa
   * @param volunteerId    - UUID do voluntário que está sinalizando
   * @param level          - Nível do risco: 'baixo' | 'medio' | 'alto' | 'imediato'
   * @param reason         - Descrição breve do sinal identificado
   * @param actionTaken    - Ação adotada (ex: 'orientei CVV 188')
   */
  static async flagRisk(conversationId: string, volunteerId: string, level: 'baixo' | 'medio' | 'alto' | 'imediato', reason: string, actionTaken?: string) {
    // 1. Cria o registro de sinalização de risco
    const { data: flag, error } = await supabaseAdmin
      .from('risk_flags')
      .insert({ conversation_id: conversationId, created_by: volunteerId, level, reason, action_taken: actionTaken })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao registrar sinalização de risco: ' + error.message, 400);
    }

    // 2. Atualiza a conversa para refletir a prioridade elevada
    await supabaseAdmin
      .from('conversations')
      .update({
        status: 'sinalizada',
        priority: level === 'imediato' || level === 'alto' ? 'crise' : 'prioritaria',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return flag;
  }
}
