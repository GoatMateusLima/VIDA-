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
import { AuditService } from './AuditService';
import { PresenceService } from './PresenceService';

export class ConversationService {
  /**
   * Cria um novo atendimento para o usuário (entra na fila de espera).
   * Se já existir um atendimento ativo ou aguardando, retorna-o para evitar bloqueio.
   *
   * @param userId - UUID do usuário que quer atendimento
   */
  static async create(userId: string) {
    // Verifica se o usuário já está na fila ou em conversa ativa
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id, status, priority, created_at')
      .eq('user_id', userId)
      .in('status', ['aguardando', 'ativa'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (existing) {
      let queuePosition = 1;
      let estimatedWaitMinutes = 4;
      if (existing.status === 'aguardando') {
        const { count: position } = await supabaseAdmin
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'aguardando')
          .lte('created_at', existing.created_at);
        queuePosition = position || 1;
        estimatedWaitMinutes = Math.max(2, queuePosition * 3);
      }
      return {
        ...existing,
        position: queuePosition,
        estimated_wait_minutes: estimatedWaitMinutes,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({ user_id: userId, status: 'aguardando', priority: 'normal' })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao iniciar atendimento: ' + error.message, 400);
    }

    // Gap #2 — posição na fila e tempo estimado de espera
    const { count: position } = await supabaseAdmin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'aguardando')
      .lte('created_at', data.created_at);

    const { count: onlineVolunteers } = await supabaseAdmin
      .from('volunteer_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('availability_status', 'online');

    const queuePosition = position || 1;
    const volunteers = onlineVolunteers || 1;
    const estimatedWaitMinutes = Math.ceil((queuePosition * 5) / volunteers);

    // Notifica todos os voluntários com SSE aberto que chegou uma nova entrada na fila
    PresenceService.broadcastQueue('queue_entry', {
      id: data.id,
      status: data.status,
      priority: data.priority,
      created_at: data.created_at,
      anonymous_name: `Pessoa aguardando ${queuePosition}`,
      position: queuePosition,
      estimatedWait: estimatedWaitMinutes,
    });

    return {
      ...data,
      position: queuePosition,
      estimated_wait_minutes: estimatedWaitMinutes,
    };
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
    const isPrivileged = ['moderador', 'administrador'].includes(role);

    if (!isParticipant && !isAssignedVolunteer && !isPrivileged) {
      throw new AppError('Você não tem permissão para acessar este atendimento.', 403);
    }

    // Gap #3 — busca nome do voluntário para exibição no frontend
    let volunteer_display_name: string | null = null;
    if (conversation.volunteer_id) {
      const { data: volunteerUser } = await supabaseAdmin
        .from('users')
        .select('display_name')
        .eq('id', conversation.volunteer_id)
        .single();
      volunteer_display_name = volunteerUser?.display_name ?? null;
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

    return { ...conversation, volunteer_display_name, messages: decryptedMessages };
  }

  /**
   * Envia uma mensagem em um atendimento ativo.
   * O texto é criptografado antes de ser salvo — o banco nunca armazena texto puro.
   *
   * @param conversationId - UUID da conversa
   * @param senderId       - UUID do remetente
   * @param text           - Texto original da mensagem
   * @param replyToId      - UUID opcional da mensagem que está sendo respondida
   */
  static async sendMessage(conversationId: string, senderId: string, role: string, text: string, replyToId?: string) {
    // Valida que a conversa está ativa antes de permitir envio
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('status, user_id, volunteer_id')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw new AppError('Atendimento não encontrado.', 404);
    }

    if (conversation.status !== 'ativa') {
      throw new AppError('Você só pode enviar mensagens em conversas ativas.', 400);
    }
    const canSend =
      conversation.user_id === senderId ||
      conversation.volunteer_id === senderId ||
      ['moderador', 'administrador'].includes(role);
    if (!canSend) {
      throw new AppError('Você não participa deste atendimento.', 403);
    }

    // Criptografa o conteúdo antes de persistir
    const bodyEncrypted = encryptMessage(text);

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        body_encrypted: bodyEncrypted,
        type: 'text',
        reply_to_id: replyToId || null,
      })
      .select()
      .single();

    if (error) {
      throw new AppError('Erro ao enviar mensagem: ' + error.message, 400);
    }

    // Desliga digitação do remetente
    PresenceService.setTyping('conversation', conversationId, senderId, '', false);
    // Transmite mensagem em tempo real para os ouvintes SSE da conversa
    PresenceService.broadcastConversation(conversationId, 'message', {
      ...data,
      body: text,
      body_encrypted: text,
    });

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
  static async close(conversationId: string, userId: string, role: string, closedReason: string) {
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convErr || !conversation) {
      throw new AppError('Atendimento não encontrado.', 404);
    }
    const canClose =
      conversation.user_id === userId ||
      conversation.volunteer_id === userId ||
      ['moderador', 'administrador'].includes(role);
    if (!canClose) {
      throw new AppError('Você não participa deste atendimento.', 403);
    }
    if (['encerrada', 'arquivada'].includes(conversation.status)) {
      throw new AppError('Este atendimento já foi encerrado.', 409);
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

    // Se estava aguardando, notifica os voluntários para remover da fila em tempo real
    PresenceService.broadcastQueue('queue_remove', { id: conversationId });

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
    const { data: profile } = await supabaseAdmin
      .from('volunteer_profiles')
      .select('availability_status')
      .eq('user_id', volunteerId)
      .single();
    if (!profile || profile.availability_status !== 'online') {
      throw new AppError('Defina sua disponibilidade como online antes de aceitar.', 409);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ status: 'ativa', volunteer_id: volunteerId, started_at: now, updated_at: now })
      .eq('id', conversationId)
      .eq('status', 'aguardando')
      .is('volunteer_id', null)
      .select()
      .maybeSingle();

    if (error) {
      throw new AppError('Erro ao aceitar atendimento: ' + error.message, 400);
    }
    if (!data) {
      throw new AppError('Este atendimento já foi assumido ou encerrado.', 409);
    }

    await supabaseAdmin
      .from('volunteer_profiles')
      .update({ availability_status: 'ocupado' })
      .eq('user_id', volunteerId);

    // Notifica o usuário (via SSE da conversa) que o voluntário aceitou
    // O frontend em app.conversar.tsx escuta esse evento para navegar ao chat
    PresenceService.broadcastConversation(conversationId, 'accepted', {
      conversationId,
      volunteerId,
      startedAt: now,
    });

    // Notifica demais voluntários que essa conversa saiu da fila
    PresenceService.broadcastQueue('queue_remove', { id: conversationId });

    return data;
  }

  /**
   * Retorna a lista de atendimentos aguardando na fila (ordenados por chegada).
   * Inclui o display_name do usuário via join para o dashboard do voluntário.
   */
  static async getQueue() {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id, status, priority, created_at, users:user_id(display_name)')
      .eq('status', 'aguardando')
      .order('created_at', { ascending: true }); // FIFO: primeiro que chegou, primeiro atendido

    if (error) {
      throw new AppError('Erro ao buscar fila de atendimento: ' + error.message, 400);
    }

    return (data || []).map((item: any, index: number) => ({
      id: item.id,
      status: item.status,
      priority: item.priority,
      created_at: item.created_at,
      anonymous_name: `Pessoa aguardando ${index + 1}`,
    }));
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
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('volunteer_id, status')
      .eq('id', conversationId)
      .single();
    if (!conversation) {
      throw new AppError('Atendimento não encontrado.', 404);
    }
    if (conversation.volunteer_id !== volunteerId) {
      throw new AppError('Somente o voluntário responsável pode sinalizar risco.', 403);
    }
    if (!['ativa', 'sinalizada'].includes(conversation.status)) {
      throw new AppError('Não é possível sinalizar uma conversa encerrada.', 409);
    }
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

    await AuditService.record(volunteerId, 'conversation.risk_flagged', 'conversation', conversationId, {
      level,
    });
    return flag;
  }

  static async history(userId: string, role: string, page: number, limit: number) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = supabaseAdmin
      .from('conversations')
      .select('id, user_id, volunteer_id, status, priority, started_at, ended_at, closed_reason, created_at, updated_at', {
        count: 'exact',
      });

    if (!['moderador', 'administrador'].includes(role)) {
      query = role === 'voluntario'
        ? query.eq('volunteer_id', userId)
        : query.eq('user_id', userId);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError('Erro ao buscar histórico: ' + error.message, 400);
    }

    // Enriquecer cada conversa com anonymous_name e last_message
    const items = await Promise.all((data || []).map(async (conv: any) => {
      // Busca última mensagem descriptografada
      const { data: lastMsgData } = await supabaseAdmin
        .from('messages')
        .select('body_encrypted, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastMessage = lastMsgData
        ? decryptMessage(lastMsgData.body_encrypted)
        : null;

      return {
        ...conv,
        anonymous_name: 'Pessoa acolhida',
        last_message: lastMessage,
      };
    }));

    return { items, page, limit, total: count || 0 };
  }

  static async messagesAfter(
    conversationId: string,
    userId: string,
    role: string,
    after?: string
  ) {
    await this.getById(conversationId, userId, role);
    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (after) {
      query = query.gt('created_at', after);
    }
    const { data, error } = await query.limit(100);
    if (error) {
      throw new AppError('Erro ao acompanhar mensagens.', 400);
    }
    return (data || []).map((message) => ({
      ...message,
      body: decryptMessage(message.body_encrypted),
      body_encrypted: undefined,
    }));
  }
}
