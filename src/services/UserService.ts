/**
 * VIDA+ - UserService (Camada de Regras de Negócio - Usuários)
 *
 * Esta camada contém toda a lógica de negócio relacionada a usuários.
 * Os controllers chamam esses métodos — nunca acessam o banco diretamente.
 *
 * Responsabilidades:
 *   - Registro e autenticação via Supabase Auth
 *   - Leitura e atualização de perfil do usuário logado
 *   - Registro de consentimentos LGPD (aceite de termos e privacidade)
 *
 * Regra de uso do cliente Supabase:
 *   - `supabase` (anon): usado para operações de auth (signUp, signInWithPassword)
 *   - `supabaseAdmin`: usado para leitura/escrita nas tabelas públicas (ignora RLS)
 */

import { supabase, supabaseAdmin } from "../config/database";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorMiddleware";
import { UserRole } from "../types";
import { CommunityService } from "./CommunityService";

export class UserService {
  static async listSafeUsers() {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("id, display_name, role, status")
      .order("display_name", { ascending: true });

    if (error) {
      throw new AppError("Erro ao listar usuários: " + error.message, 400);
    }
    return users;
  }

  static async listTeamUsers() {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("id, display_name, role, status")
      .in("role", ["voluntario", "moderador", "administrador"])
      .order("display_name", { ascending: true });

    if (error) {
      throw new AppError("Erro ao listar membros da equipe: " + error.message, 400);
    }
    return users;
  }

  static async listUsers() {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("id, display_name, role, status, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError("Erro ao listar usuarios: " + error.message, 400);
    }

    return Promise.all(
      (users || []).map(async (user) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
          user.id,
        );
        return { ...user, email: authUser.user?.email || "" };
      }),
    );
  }

  static async updateRole(userId: string, role: Exclude<UserRole, "anonimo">) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, display_name, role, status, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new AppError("Erro ao atualizar papel do usuario.", 400);
    }

    if (role === "voluntario") {
      await supabaseAdmin
        .from("volunteer_profiles")
        .upsert({
          user_id: userId,
          availability_status: "online",
          training_status: "concluido",
          risk_level_allowed: "baixo",
          total_chats: 0
        });
    }

    if (["moderador", "administrador"].includes(role)) {
      await CommunityService.ensureStaffInAllCommunities(userId);
    }

    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    return { ...data, email: authUser.user?.email || "" };
  }

  /**
   * Registra um novo usuário no Supabase Auth.
   * O trigger SQL `on_auth_user_created` cria automaticamente o registro
   * nas tabelas public.users e public.user_profiles após o signUp.
   *
   * @param email       - E-mail do usuário
   * @param password    - Senha (criptografada pelo Supabase internamente)
   * @param displayName - Nome de exibição na plataforma
   * @param role        - Cargo inicial do usuário (padrão: 'cadastrado')
   */
  static async register(email: string, password: string, displayName: string, nickname: string) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        nickname,
      },
    });

    if (error || !created.user) {
      throw new AppError(
        error?.message || "Nao foi possivel criar o usuario.",
        400,
      );
    }

    await supabaseAdmin.from("users").upsert({
      id: created.user.id,
      display_name: displayName,
      role: "cadastrado",
      status: "ativo",
      updated_at: new Date().toISOString(),
    });
    await supabaseAdmin
      .from("user_profiles")
      .upsert({ user_id: created.user.id, nickname });

    return this.login(email, password);
  }

  static async requestPasswordReset(email: string) {
    const options = env.PASSWORD_RESET_REDIRECT_URL
      ? { redirectTo: env.PASSWORD_RESET_REDIRECT_URL }
      : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, options);
    if (error) {
      console.error(
        "[Auth] Falha ao solicitar recuperação de senha:",
        error.message,
      );
    }
  }

  static async updatePassword(token: string, password: string) {
    const client = clientWithToken(token);
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      throw new AppError("Não foi possível atualizar a senha.", 400);
    }
  }

  /**
   * Autentica um usuário pelo e-mail e senha.
   * Retorna a sessão (access_token, refresh_token) e os dados do usuário.
   * O access_token deve ser enviado em todas as requisições autenticadas.
   */
  static async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Mensagem genérica para não revelar se o e-mail existe ou não
      throw new AppError(
        "Credenciais inválidas. Verifique seu e-mail e senha.",
        401,
      );
    }

    return data;
  }

  static async refreshSession(refreshToken: string) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      throw new AppError("Session expired. Please sign in again.", 401);
    }
    return data;
  }

  /**
   * Encerra a sessão do usuário no Supabase (invalida o access_token).
   *
   * @param token - O access_token atual do usuário
   */
  static async logout(token: string) {
    const client = clientWithToken(token);
    const { error } = await client.auth.signOut();
    if (error) {
      throw new AppError(error.message, 400);
    }
  }

  /**
   * Retorna os dados completos do usuário logado:
   * informações da tabela public.users + perfil da tabela public.user_profiles.
   *
   * @param userId - UUID do usuário autenticado (vem de req.user.id)
   */
  static async getProfile(userId: string) {
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    // Busca o perfil adicional (pode ser nulo se o usuário for muito novo)
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Busca o email do Supabase Auth (não está na tabela pública)
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);

    return {
      ...user,
      email: authUser?.user?.email ?? null,
      profile: profile || null,
    };
  }

  /**
   * Atualiza as preferências e dados do perfil do usuário.
   * Somente campos passados no objeto `updates` serão alterados.
   *
   * @param userId  - UUID do usuário
   * @param updates - Campos a atualizar na tabela user_profiles
   */
  static async updateProfile(
    userId: string,
    updates: {
      nickname?: string;
      birth_year?: number;
      state?: string;
      preferences_json?: any;
    },
  ) {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .update({
        nickname: updates.nickname,
        birth_year: updates.birth_year,
        state: updates.state,
        preferences_json: updates.preferences_json,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw new AppError("Erro ao atualizar perfil: " + error.message, 400);
    }

    if (updates.nickname) {
      const { error: membershipError } = await supabaseAdmin
        .from("community_members")
        .update({ alias: updates.nickname })
        .eq("user_id", userId)
        .eq("status", "ativo");
      if (membershipError) {
        throw new AppError("Perfil atualizado, mas não foi possível atualizar o apelido nos grupos.", 500);
      }
    }

    return data;
  }

  /**
   * Registra o aceite de um documento de consentimento LGPD.
   * Cada aceite é armazenado com a versão do documento, data e IP anonimizado.
   *
   * @param userId      - UUID do usuário que aceitou
   * @param consentType - Ex: 'termos_de_uso', 'politica_privacidade'
   * @param version     - Versão do documento (ex: '1.0', '2.1')
   * @param ipHash      - Hash anonimizado do IP para fins de auditoria
   */
  static async registerConsent(
    userId: string,
    consentType: string,
    version: string,
    ipHash?: string,
  ) {
    const { data, error } = await supabaseAdmin
      .from("consents")
      .insert({
        user_id: userId,
        type: consentType,
        version,
        ip_hash: ipHash,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(
        "Erro ao registrar consentimento: " + error.message,
        400,
      );
    }

    return data;
  }
}

// ─── Auxiliar interno: cria cliente Supabase com token específico ─────────────
// Usado apenas no logout para invalidar o token correto no Supabase Auth
function clientWithToken(token: string) {
  const { env } = require("../config/env");
  const { createClient } = require("@supabase/supabase-js");
  const WebSocket = require("ws");
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    realtime: {
      transport: WebSocket,
    },
  });
}
