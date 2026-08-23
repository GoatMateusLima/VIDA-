import { Response } from 'express';

interface PresenceEntry {
  userId: string;
  alias: string;
  role: string;
  communityId?: string;
  conversationId?: string;
  lastSeen: number;
}

interface TypingEntry {
  userId: string;
  alias: string;
  expiresAt: number;
}

export class PresenceService {
  private static presenceMap = new Map<string, PresenceEntry>();
  private static typingMap = new Map<string, TypingEntry>();
  private static communitySSEListeners = new Map<string, Set<Response>>();
  private static conversationSSEListeners = new Map<string, Set<Response>>();
  // Canal global: todos os voluntários conectados escutam novas entradas na fila
  private static queueSSEListeners = new Set<Response>();

  // Timeout para considerar offline (45 segundos)
  private static PRESENCE_TTL_MS = 45000;
  // Timeout para parar de exibir digitando (4 segundos)
  private static TYPING_TTL_MS = 4000;

  static {
    // Limpeza periódica a cada 15 segundos
    setInterval(() => {
      this.cleanup();
    }, 15000);
  }

  // ─── PRESENÇA & HEARTBEATS ──────────────────────────────────────────────────

  static recordHeartbeat(
    userId: string,
    alias: string,
    role: string,
    location?: { communityId?: string; conversationId?: string }
  ) {
    const existing = this.presenceMap.get(userId);
    const prevCommunityId = existing?.communityId;

    this.presenceMap.set(userId, {
      userId,
      alias,
      role,
      communityId: location?.communityId,
      conversationId: location?.conversationId,
      lastSeen: Date.now(),
    });

    // Se mudou de comunidade, notifica ambas
    if (location?.communityId && location.communityId !== prevCommunityId) {
      this.broadcastCommunity(location.communityId, 'presence', {
        onlineCount: this.getCommunityOnlineCount(location.communityId),
        users: this.getCommunityOnlineUsers(location.communityId),
      });
    }
    if (prevCommunityId && prevCommunityId !== location?.communityId) {
      this.broadcastCommunity(prevCommunityId, 'presence', {
        onlineCount: this.getCommunityOnlineCount(prevCommunityId),
        users: this.getCommunityOnlineUsers(prevCommunityId),
      });
    }
  }

  static getCommunityOnlineUsers(communityId: string) {
    const now = Date.now();
    const result: Array<{ userId: string; alias: string; role: string }> = [];

    for (const entry of this.presenceMap.values()) {
      if (
        entry.communityId === communityId &&
        now - entry.lastSeen <= this.PRESENCE_TTL_MS
      ) {
        result.push({
          userId: entry.userId,
          alias: entry.alias,
          role: entry.role,
        });
      }
    }
    return result;
  }

  static getCommunityOnlineCount(communityId: string): number {
    return this.getCommunityOnlineUsers(communityId).length;
  }

  static getGlobalOnlineStats() {
    const now = Date.now();
    let totalUsers = 0;
    let onlineVolunteers = 0;

    for (const entry of this.presenceMap.values()) {
      if (now - entry.lastSeen <= this.PRESENCE_TTL_MS) {
        totalUsers++;
        if (entry.role === 'voluntario' || entry.role === 'administrador') {
          onlineVolunteers++;
        }
      }
    }
    return { totalUsers, onlineVolunteers };
  }

  static removeUser(userId: string) {
    const entry = this.presenceMap.get(userId);
    if (entry?.communityId) {
      const commId = entry.communityId;
      this.presenceMap.delete(userId);
      this.broadcastCommunity(commId, 'presence', {
        onlineCount: this.getCommunityOnlineCount(commId),
        users: this.getCommunityOnlineUsers(commId),
      });
    } else {
      this.presenceMap.delete(userId);
    }
  }

  // ─── DIGITAÇÃO (TYPING INDICATOR) ──────────────────────────────────────────

  static setTyping(
    scopeType: 'community' | 'conversation',
    scopeId: string,
    userId: string,
    alias: string,
    typing: boolean
  ) {
    const key = `${scopeType}:${scopeId}:${userId}`;

    if (typing) {
      this.typingMap.set(key, {
        userId,
        alias,
        expiresAt: Date.now() + this.TYPING_TTL_MS,
      });
    } else {
      this.typingMap.delete(key);
    }

    const typingUsers = this.getTypingUsers(scopeType, scopeId);

    if (scopeType === 'community') {
      this.broadcastCommunity(scopeId, 'typing', {
        userId,
        alias,
        typing,
        typingUsers,
      });
    } else {
      this.broadcastConversation(scopeId, 'typing', {
        userId,
        alias,
        typing,
        typingUsers,
      });
    }
  }

  static getTypingUsers(
    scopeType: 'community' | 'conversation',
    scopeId: string,
    excludeUserId?: string
  ): Array<{ userId: string; alias: string }> {
    const now = Date.now();
    const prefix = `${scopeType}:${scopeId}:`;
    const result: Array<{ userId: string; alias: string }> = [];

    for (const [key, entry] of this.typingMap.entries()) {
      if (key.startsWith(prefix)) {
        if (entry.expiresAt > now) {
          if (!excludeUserId || entry.userId !== excludeUserId) {
            result.push({ userId: entry.userId, alias: entry.alias });
          }
        } else {
          this.typingMap.delete(key);
        }
      }
    }
    return result;
  }

  // ─── FILA GLOBAL (Queue SSE) ─────────────────────────────────────────────

  /**
   * Registra um voluntário como ouvinte do canal de fila global.
   * Remove automaticamente quando a conexão SSE é fechada.
   */
  static subscribeQueue(res: Response) {
    this.queueSSEListeners.add(res);
    res.on('close', () => {
      this.queueSSEListeners.delete(res);
    });
  }

  /**
   * Transmite um evento de fila para todos os voluntários conectados.
   *
   * @param eventName - "queue_update" | "queue_entry" | "queue_remove"
   * @param data      - payload do evento
   */
  static broadcastQueue(eventName: string, data: any) {
    if (this.queueSSEListeners.size === 0) return;
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.queueSSEListeners) {
      try {
        res.write(payload);
      } catch {
        this.queueSSEListeners.delete(res);
      }
    }
  }

  // ─── SSE SUBSCRIPTIONS & BROADCASTS ────────────────────────────────────────

  static subscribeCommunity(communityId: string, res: Response) {
    if (!this.communitySSEListeners.has(communityId)) {
      this.communitySSEListeners.set(communityId, new Set());
    }
    this.communitySSEListeners.get(communityId)!.add(res);

    res.on('close', () => {
      this.communitySSEListeners.get(communityId)?.delete(res);
    });
  }

  static broadcastCommunity(communityId: string, eventName: string, data: any) {
    const listeners = this.communitySSEListeners.get(communityId);
    if (!listeners || listeners.size === 0) return;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of listeners) {
      try {
        res.write(payload);
      } catch {
        listeners.delete(res);
      }
    }
  }

  static subscribeConversation(conversationId: string, res: Response) {
    if (!this.conversationSSEListeners.has(conversationId)) {
      this.conversationSSEListeners.set(conversationId, new Set());
    }
    this.conversationSSEListeners.get(conversationId)!.add(res);

    res.on('close', () => {
      this.conversationSSEListeners.get(conversationId)?.delete(res);
    });
  }

  static broadcastConversation(conversationId: string, eventName: string, data: any) {
    const listeners = this.conversationSSEListeners.get(conversationId);
    if (!listeners || listeners.size === 0) return;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of listeners) {
      try {
        res.write(payload);
      } catch {
        listeners.delete(res);
      }
    }
  }

  // ─── LIMPEZA DE SESSÕES EXPIRADAS ──────────────────────────────────────────

  private static cleanup() {
    const now = Date.now();

    // Limpa presenças expiradas
    for (const [userId, entry] of this.presenceMap.entries()) {
      if (now - entry.lastSeen > this.PRESENCE_TTL_MS) {
        const commId = entry.communityId;
        this.presenceMap.delete(userId);
        if (commId) {
          this.broadcastCommunity(commId, 'presence', {
            onlineCount: this.getCommunityOnlineCount(commId),
            users: this.getCommunityOnlineUsers(commId),
          });
        }
      }
    }

    // Limpa digitações expiradas
    for (const [key, entry] of this.typingMap.entries()) {
      if (entry.expiresAt <= now) {
        this.typingMap.delete(key);
      }
    }
  }
}
