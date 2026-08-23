/**
 * VIDA+ - Validação de Variáveis de Ambiente
 *
 * Este arquivo lê e valida as variáveis do arquivo .env antes que qualquer outra
 * parte da aplicação tente usá-las. Se uma variável obrigatória estiver faltando
 * ou inválida, a aplicação aborta imediatamente com uma mensagem de erro clara.
 *
 * Variáveis obrigatórias:
 *   PORT                    → Porta em que o servidor Express escutará
 *   SUPABASE_URL            → URL do projeto Supabase (Settings > API)
 *   SUPABASE_ANON_KEY       → Chave pública do Supabase (para operações do usuário)
 *   SUPABASE_SERVICE_ROLE_KEY → Chave secreta do Supabase (para operações admin)
 *   NODE_ENV                → Ambiente atual: development | production | test
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Carrega as variáveis do arquivo .env para process.env
dotenv.config();

// Schema de validação usando Zod — define as regras de cada variável
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SUPABASE_URL: z.string().url('SUPABASE_URL precisa ser uma URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatória'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatória'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MESSAGE_ENCRYPTION_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  PASSWORD_RESET_REDIRECT_URL: z.string().url().optional(),
});

// Tenta validar as variáveis — se falhar, mostra o erro e encerra o processo
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Erro de validação das variáveis de ambiente:', parsed.error.format());
  process.exit(1);
}

if (
  parsed.data.NODE_ENV === 'production' &&
  (!parsed.data.MESSAGE_ENCRYPTION_KEY ||
    !/^[A-Za-z0-9+/]{43}=$/.test(parsed.data.MESSAGE_ENCRYPTION_KEY))
) {
  console.error('MESSAGE_ENCRYPTION_KEY deve ser uma chave Base64 de 32 bytes em produção.');
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);
