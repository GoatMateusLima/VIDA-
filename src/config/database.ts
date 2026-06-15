/**
 * VIDA+ - Clientes do Supabase
 *
 * Este arquivo inicializa e exporta dois clientes distintos do Supabase:
 *
 * 1. `supabase` (Anon Key / Cliente padrão)
 *    - Usa a chave pública do projeto
 *    - Respeita as políticas de Row Level Security (RLS) configuradas no banco
 *    - Ideal para operações que precisam do contexto do usuário autenticado
 *
 * 2. `supabaseAdmin` (Service Role Key / Cliente administrativo)
 *    - Usa a chave secreta do projeto
 *    - IGNORA todas as políticas de RLS — tem acesso irrestrito ao banco
 *    - Usado EXCLUSIVAMENTE no backend para operações privilegiadas:
 *      ex: aprovar voluntários, criar perfis via trigger, acessar dados de auditoria
 *    - NUNCA deve ser exposto ao frontend
 *
 * Ambos os clientes leem as credenciais do arquivo .env via src/config/env.ts
 */

import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Cliente padrão — respeita RLS, usado para operações comuns
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Cliente admin — ignora RLS, usado para operações administrativas no backend
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false, // O backend não precisa renovar tokens automaticamente
    persistSession: false    // O backend não armazena sessões em memória
  }
});
