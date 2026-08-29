import { randomInt } from 'crypto';
import { supabaseAdmin } from '../config/database';
import { AppError } from '../middlewares/errorMiddleware';
import { decryptMessage, encryptMessage } from '../utils/helpers';
import { AuditService } from './AuditService';
import { PresenceService } from './PresenceService';
import { UserRole } from '../types';

const ADJECTIVES = ['Calmo', 'Gentil', 'Solar', 'Sereno', 'Leve', 'Brilhante', 'Amigo', 'Livre'];
const NOUNS = ['Horizonte', 'Girassol', 'Caminho', 'Abraço', 'Farol', 'Jardim', 'Céu', 'Vento'];

function createAlias() {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${NOUNS[randomInt(NOUNS.length)]} ${randomInt(10, 100)}`;
}

export class CommunityService {
  static async adminList() {
    const { data: communities, error } = await supabaseAdmin
      .from('communities')
      .select('id, name, description, status, rules_json, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new AppError('Erro ao buscar grupos.', 400);

    return Promise.all((communities || []).map(async (community) => {
      const [{ count: memberCount }, { count: messageCount }] = await Promise.all([
        supabaseAdmin
          .from('community_members')
          .select('*', { count: 'exact', head: true })
          .eq('community_id', community.id)
          .eq('status', 'ativo'),
        supabaseAdmin
          .from('community_messages')
          .select('*', { count: 'exact', head: true })
          .eq('community_id', community.id)
          .is('deleted_at', null),
      ]);
      return {
        ...community,
        member_count: memberCount || 0,
        message_count: messageCount || 0,
      };
    }));
  }

  static async adminDetail(communityId: string, actorId: string) {
    const { data: community } = await supabaseAdmin
      .from('communities')
      .select('id, name, description, status, rules_json, created_at')
      .eq('id', communityId)
      .single();
    if (!community) throw new AppError('Grupo não encontrado.', 404);

    const [{ data: memberships }, { data: messages }] = await Promise.all([
      supabaseAdmin
        .from('community_members')
        .select('user_id, alias, role, status, joined_at')
        .eq('community_id', communityId)
        .order('joined_at', { ascending: false }),
      supabaseAdmin
        .from('community_messages')
        .select('id, sender_id, alias_snapshot, body_encrypted, created_at, deleted_at')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const members = await Promise.all((memberships || []).map(async (membership) => {
      const [{ data: user }, { data: authUser }] = await Promise.all([
        supabaseAdmin
          .from('users')
          .select('display_name, role, status')
          .eq('id', membership.user_id)
          .single(),
        supabaseAdmin.auth.admin.getUserById(membership.user_id),
      ]);
      return {
        ...membership,
        display_name: user?.display_name,
        platform_role: user?.role,
        user_status: user?.status,
        email: authUser.user?.email,
      };
    }));

    await AuditService.record(actorId, 'community.admin_viewed', 'community', communityId, {
      member_count: members.length,
    });

    return {
      ...community,
      members,
      messages: (messages || []).map((message) => ({
        id: message.id,
        sender_id: message.sender_id,
        alias: message.alias_snapshot,
        body: decryptMessage(message.body_encrypted),
        created_at: message.created_at,
        deleted_at: message.deleted_at,
      })),
    };
  }

  static async adminCreate(
    actorId: string,
    input: { name: string; description?: string; rules: string[] }
  ) {
    const { data, error } = await supabaseAdmin
      .from('communities')
      .insert({
        name: input.name,
        description: input.description,
        rules_json: input.rules,
        status: 'ativo',
      })
      .select('id, name, description, status, rules_json, created_at')
      .single();
    if (error) throw new AppError('Erro ao criar grupo.', 400);
    await AuditService.record(actorId, 'community.created', 'community', data.id, {
      name: data.name,
    });
    return data;
  }

  static async adminUpdate(
    communityId: string,
    actorId: string,
    input: { name?: string; description?: string; rules?: string[]; status?: string }
  ) {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.rules !== undefined) update.rules_json = input.rules;
    if (input.status !== undefined) update.status = input.status;
    const { data, error } = await supabaseAdmin
      .from('communities')
      .update(update)
      .eq('id', communityId)
      .select('id, name, description, status, rules_json, created_at')
      .single();
    if (error || !data) throw new AppError('Erro ao atualizar grupo.', 400);
    await AuditService.record(actorId, 'community.updated', 'community', communityId, update);
    return data;
  }

  static async adminUpdateMember(
    communityId: string,
    userId: string,
    actorId: string,
    status: 'ativo' | 'removido'
  ) {
    const { data, error } = await supabaseAdmin
      .from('community_members')
      .update({ status })
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .select('community_id, user_id, alias, role, status, joined_at')
      .single();
    if (error || !data) throw new AppError('Erro ao atualizar participante.', 400);
    await AuditService.record(actorId, 'community.member_status_updated', 'community_member', userId, {
      community_id: communityId,
      status,
    });
    return data;
  }

  static async adminDeleteMessage(messageId: string, actorId: string, reason: string) {
    const deletedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('community_messages')
      .update({ deleted_at: deletedAt })
      .eq('id', messageId)
      .select('id, community_id, sender_id, alias_snapshot, deleted_at')
      .single();
    if (error || !data) throw new AppError('Erro ao remover mensagem.', 400);
    await AuditService.record(actorId, 'community.message_removed', 'community_message', messageId, {
      community_id: data.community_id,
      target_user_id: data.sender_id,
      reason,
    });
    return data;
  }

  static async list(userId?: string) {
    // Garante que o grupo "vida+" exista e a equipe esteja inserida nele
    await this.ensureVidaPlusGroup();

    let userRole: string | null = null;
    if (userId) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      userRole = user?.role ?? null;
    }

    const { data, error } = await supabaseAdmin
      .from('communities')
      .select('id, name, description, rules_json, created_at')
      .eq('status', 'ativo')
      .order('name');
    if (error) throw new AppError('Erro ao buscar grupos.', 400);

    let communities = data || [];

    // Filtra o grupo "vida+" para usuários comuns
    if (!userRole || !['voluntario', 'moderador', 'administrador'].includes(userRole)) {
      communities = communities.filter(c => c.name.toLowerCase() !== 'vida+');
    }

    const communityIds = communities.map((c) => c.id);

    // Contagem agregada de membros ativos em cada grupo
    const { data: memberRows } = await supabaseAdmin
      .from('community_members')
      .select('community_id')
      .in('community_id', communityIds)
      .eq('status', 'ativo');

    const memberCountMap = new Map<string, number>();
    for (const row of memberRows || []) {
      memberCountMap.set(row.community_id, (memberCountMap.get(row.community_id) || 0) + 1);
    }

    let memberMap = new Map<string, string>();
    if (userId) {
      const { data: memberships } = await supabaseAdmin
        .from('community_members')
        .select('community_id, alias')
        .eq('user_id', userId)
        .eq('status', 'ativo');
      memberMap = new Map((memberships || []).map((item) => [item.community_id, item.alias]));
    }

    return communities.map((community) => {
      const count = memberCountMap.get(community.id) || 0;
      const online = PresenceService.getCommunityOnlineCount(community.id);
      return {
        ...community,
        member_count: count,
        memberCount: count,
        online_count: online,
        onlineCount: online,
        is_member: memberMap.has(community.id),
        joined: memberMap.has(community.id),
        my_alias: memberMap.get(community.id) ?? null,
        myAlias: memberMap.get(community.id) ?? null,
      };
    });
  }

  static async join(communityId: string, userId: string) {
    const { data: community } = await supabaseAdmin
      .from('communities')
      .select('id, name, status')
      .eq('id', communityId)
      .single();
    if (!community || community.status !== 'ativo') {
      throw new AppError('Grupo não encontrado.', 404);
    }

    if (community.name.toLowerCase() === 'vida+') {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      if (!user || !['voluntario', 'moderador', 'administrador'].includes(user.role)) {
        throw new AppError('Apenas membros da equipe podem participar deste grupo.', 403);
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('community_members')
      .select('community_id, user_id, alias, role, status')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing?.status === 'ativo') return existing;

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('nickname')
      .eq('user_id', userId)
      .single();
    const alias = profile?.nickname?.trim() || existing?.alias || createAlias();
    const payload = { community_id: communityId, user_id: userId, alias, role: 'membro', status: 'ativo' };
    const { data, error } = await supabaseAdmin
      .from('community_members')
      .upsert(payload)
      .select('community_id, alias, role, status, joined_at')
      .single();
    if (error) throw new AppError('Erro ao entrar no grupo.', 400);
    return data;
  }

  static async leave(communityId: string, userId: string) {
    const { error } = await supabaseAdmin
      .from('community_members')
      .update({ status: 'saiu' })
      .eq('community_id', communityId)
      .eq('user_id', userId);
    if (error) throw new AppError('Erro ao sair do grupo.', 400);
  }

  static async messages(communityId: string, userId: string, page: number, limit: number) {
    await this.requireMember(communityId, userId);
    const from = (page - 1) * limit;
    const { data, error, count } = await supabaseAdmin
      .from('community_messages')
      .select('id, community_id, sender_id, alias_snapshot, body_encrypted, created_at, edited_at, deleted_at', { count: 'exact' })
      .eq('community_id', communityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw new AppError('Erro ao buscar mensagens do grupo.', 400);
    return {
      items: (data || []).reverse().map((message) => ({
        id: message.id,
        community_id: message.community_id,
        sender_id: message.sender_id,
        alias_snapshot: message.alias_snapshot,
        alias: message.alias_snapshot,
        body: decryptMessage(message.body_encrypted),  // texto limpo — nunca expor body_encrypted
        text: decryptMessage(message.body_encrypted),  // alias extra para compatibilidade
        is_mine: message.sender_id === userId,
        created_at: message.created_at,
        edited_at: message.edited_at,
      })),
      page,
      limit,
      total: count || 0,
    };
  }

  static async send(communityId: string, userId: string, text: string) {
    const member = await this.requireMember(communityId, userId);
    const { data, error } = await supabaseAdmin
      .from('community_messages')
      .insert({
        community_id: communityId,
        sender_id: userId,
        alias_snapshot: member.alias,
        body_encrypted: encryptMessage(text),
      })
      .select('id, community_id, alias_snapshot, created_at')
      .single();
    if (error) throw new AppError('Erro ao enviar mensagem ao grupo.', 400);

    const messageResult = {
      id: data.id,
      community_id: data.community_id,
      sender_id: userId,
      alias_snapshot: data.alias_snapshot,
      alias: data.alias_snapshot,
      body: text, // texto limpo original
      text: text, // alias extra para compatibilidade
      is_mine: true,
      created_at: data.created_at,
    };

    // Desliga digitação do remetente
    PresenceService.setTyping('community', communityId, userId, member.alias, false);
    // Broadcast em tempo real para os membros do grupo via SSE
    PresenceService.broadcastCommunity(communityId, 'message', messageResult);

    return messageResult;
  }

  static async revealIdentity(messageId: string, actorId: string, actorRole: UserRole, reason: string) {
    const { data: message } = await supabaseAdmin
      .from('community_messages')
      .select('id, sender_id, community_id, alias_snapshot')
      .eq('id', messageId)
      .single();
    if (!message) throw new AppError('Mensagem não encontrada.', 404);
    if (actorRole === 'moderador') {
      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('id')
        .eq('target_type', 'mensagem')
        .eq('target_id', messageId)
        .in('status', ['pendente', 'em_analise'])
        .limit(1)
        .maybeSingle();
      if (!report) {
        throw new AppError('A identidade só pode ser consultada em uma denúncia aberta.', 403);
      }
    }
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, display_name, role, status')
      .eq('id', message.sender_id)
      .single();
    if (!user) throw new AppError('Usuário não encontrado.', 404);
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(message.sender_id);
    await AuditService.record(actorId, 'community.identity_revealed', 'community_message', messageId, {
      reason,
      actor_role: actorRole,
      community_id: message.community_id,
      target_user_id: message.sender_id,
    });
    return {
      message_id: message.id,
      alias: message.alias_snapshot,
      user_id: user.id,
      display_name: user.display_name,
      email: authUser.user?.email,
      role: user.role,
      status: user.status,
    };
  }

  static async ensureVidaPlusGroup() {
    try {
      let { data: community } = await supabaseAdmin
        .from('communities')
        .select('id')
        .eq('name', 'vida+')
        .maybeSingle();

      if (!community) {
        const { data: newCommunity, error: createErr } = await supabaseAdmin
          .from('communities')
          .insert({
            name: 'vida+',
            description: 'Grupo exclusivo para a equipe da plataforma (Administradores, Moderadores e Voluntários).',
            rules_json: ['Mantenha o respeito', 'Sigilo profissional absoluto'],
            status: 'ativo'
          })
          .select('id')
          .single();
        if (createErr) return;
        community = newCommunity;
      }

      if (community) {
        const { data: teamUsers } = await supabaseAdmin
          .from('users')
          .select('id, nickname')
          .in('role', ['voluntario', 'moderador', 'administrador']);

        const { data: currentMembers } = await supabaseAdmin
          .from('community_members')
          .select('user_id, status')
          .eq('community_id', community.id);

        const memberMap = new Map(currentMembers?.map(m => [m.user_id, m.status]));

        for (const user of teamUsers || []) {
          const status = memberMap.get(user.id);
          if (status !== 'ativo') {
            const alias = user.nickname?.trim() || createAlias();
            await supabaseAdmin
              .from('community_members')
              .upsert({
                community_id: community.id,
                user_id: user.id,
                alias,
                role: 'membro',
                status: 'ativo'
              });
          }
        }
      }
    } catch (e) {
      // Falha silenciosa
    }
  }

  private static async requireMember(communityId: string, userId: string) {
    const { data: community } = await supabaseAdmin
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community && community.name.toLowerCase() === 'vida+') {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
      if (!user || !['voluntario', 'moderador', 'administrador'].includes(user.role)) {
        await supabaseAdmin
          .from('community_members')
          .update({ status: 'saiu' })
          .eq('community_id', communityId)
          .eq('user_id', userId);
        throw new AppError('Apenas membros da equipe podem participar deste grupo.', 403);
      }
    }

    const { data } = await supabaseAdmin
      .from('community_members')
      .select('alias, role, status')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .single();
    if (!data || data.status !== 'ativo') throw new AppError('Entre no grupo para participar.', 403);
    return data;
  }
}
