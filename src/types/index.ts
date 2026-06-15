/**
 * VIDA+ - Tipagens Globais do TypeScript
 *
 * Este arquivo centraliza todas as interfaces e tipos compartilhados entre as
 * camadas da aplicação (controllers, services, middlewares). Isso evita duplicação
 * de definições e garante consistência no formato dos dados em todo o projeto.
 *
 * Tipos definidos aqui:
 *   - UserRole          → Enum dos papéis disponíveis na plataforma
 *   - UserPayload       → Dados do usuário injetados pelo middleware de autenticação
 *   - AuthenticatedRequest → Extensão do Request do Express com o campo `user`
 *   - User, UserProfile → Estrutura das tabelas public.users e public.user_profiles
 *   - Conversation, Message → Estrutura das tabelas de atendimento
 *   - RiskFlag, Report  → Estrutura das tabelas de segurança e denúncias
 */

import { Request } from 'express';

// ─── Papéis de Usuário (espelha o ENUM user_role do banco de dados) ─────────
export type UserRole = 'anonimo' | 'cadastrado' | 'voluntario' | 'moderador' | 'administrador';

// ─── Payload extraído do token JWT do Supabase ────────────────────────────────
// Injetado pelo authMiddleware em cada requisição autenticada
export interface UserPayload {
  id: string;         // UUID do usuário no Supabase
  email?: string;     // E-mail (pode ser ausente para usuários anônimos)
  role: UserRole;     // Cargo/papel do usuário na plataforma
  display_name?: string;
}

// ─── Extensão do Request do Express ──────────────────────────────────────────
// Usado em todos os controllers para acessar req.user com tipagem correta
export interface AuthenticatedRequest extends Request {
  user?: UserPayload; // Preenchido pelo middleware requireAuth após validar o JWT
}

// ─── Estrutura da tabela public.users ────────────────────────────────────────
export interface User {
  id: string;
  display_name: string;
  role: UserRole;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── Estrutura da tabela public.user_profiles ────────────────────────────────
export interface UserProfile {
  user_id: string;
  nickname?: string;
  birth_year?: number;
  state?: string;           // Sigla do estado (ex: "SP", "RJ")
  preferences_json?: any;   // Configurações personalizadas (notificações, privacidade, etc.)
}

// ─── Estrutura da tabela public.consents (LGPD) ──────────────────────────────
export interface Consent {
  id: string;
  user_id: string;
  type: string;             // Ex: 'termos_de_uso', 'politica_privacidade'
  version: string;          // Versão do documento aceito
  accepted_at: string;
  revoked_at?: string;      // Preenchido se o usuário revogar o consentimento
}

// ─── Estrutura da tabela public.conversations ────────────────────────────────
export interface Conversation {
  id: string;
  user_id: string;
  volunteer_id?: string;    // Preenchido quando um voluntário aceita o atendimento
  status: 'aguardando' | 'ativa' | 'sinalizada' | 'encerrada' | 'arquivada';
  priority: string;         // 'normal', 'prioritaria', 'crise'
  started_at?: string;
  ended_at?: string;
  closed_reason?: string;   // Ex: 'usuario_encerrou', 'voluntario_encerrou'
  created_at: string;
  updated_at: string;
}

// ─── Estrutura da tabela public.messages ─────────────────────────────────────
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body_encrypted: string;   // Conteúdo criptografado em base64 (ver helpers.ts)
  type: string;             // 'text', 'system', 'media'
  created_at: string;
  deleted_at?: string;      // Soft delete para manter histórico de auditoria
}

// ─── Estrutura da tabela public.risk_flags ───────────────────────────────────
export interface RiskFlag {
  id: string;
  conversation_id: string;
  created_by: string;       // ID do voluntário que sinalizou
  level: 'baixo' | 'medio' | 'alto' | 'imediato';
  reason: string;           // Descrição operacional do sinal identificado
  action_taken?: string;    // Ação adotada (ex: 'encaminhado CVV 188')
  created_at: string;
}

// ─── Estrutura da tabela public.reports (Denúncias) ──────────────────────────
export interface Report {
  id: string;
  reporter_id?: string;
  target_type: string;      // 'voluntario', 'usuario', 'mensagem', 'comunidade'
  target_id: string;
  reason: string;
  description?: string;
  status: 'pendente' | 'em_analise' | 'resolvido' | 'arquivado';
  created_at: string;
}
