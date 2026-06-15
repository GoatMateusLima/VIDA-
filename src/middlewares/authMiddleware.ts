/**
 * VIDA+ - Middleware de Autenticação e Autorização (RBAC)
 *
 * Este arquivo exporta dois middlewares que protegem as rotas da API:
 *
 * 1. `requireAuth`
 *    - Intercepta cada requisição e verifica o token JWT no header Authorization
 *    - Valida o token diretamente com o Supabase Auth (não usa verificação local)
 *    - Busca o cargo (role) do usuário na tabela public.users
 *    - Injeta os dados do usuário em req.user para uso nos controllers
 *    - Retorna 401 se o token estiver ausente, expirado ou inválido
 *
 * 2. `requireRoles(...roles)`
 *    - Middleware de fábrica: recebe os cargos permitidos e retorna um middleware
 *    - Verifica se req.user.role está entre os cargos autorizados
 *    - Retorna 403 se o usuário não tiver permissão suficiente
 *    - Exemplo: requireRoles('administrador') bloqueia todos exceto admins
 *
 * Uso nas rotas:
 *   router.get('/rota', requireAuth, requireRoles('voluntario', 'administrador'), Controller.metodo)
 */

import { Response, NextFunction } from 'express';
import { supabase } from '../config/database';
import { AuthenticatedRequest, UserRole } from '../types';
import { AppError } from './errorMiddleware';

// ─── Middleware de Autenticação ────────────────────────────────────────────────
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // 1. Extrai o token JWT do header Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de autenticação não fornecido ou inválido', 401);
    }

    const token = authHeader.split(' ')[1];
    
    // 2. Valida o token no Supabase Auth — retorna o usuário se o token for válido
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      throw new AppError('Sessão expirada ou token de acesso inválido', 401);
    }

    // 3. Busca o cargo (role) do usuário na nossa tabela pública
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('role, display_name')
      .eq('id', user.id)
      .single();

    // 4. Injeta os dados do usuário em req.user para uso nos controllers
    if (dbError || !dbUser) {
      // Fallback seguro: se não encontrar no banco, assume 'cadastrado'
      req.user = {
        id: user.id,
        email: user.email,
        role: 'cadastrado',
        display_name: 'Usuário',
      };
    } else {
      req.user = {
        id: user.id,
        email: user.email,
        role: dbUser.role as UserRole,
        display_name: dbUser.display_name,
      };
    }

    next(); // Passa para o próximo middleware ou controller
  } catch (error) {
    next(error); // Passa o erro para o errorMiddleware
  }
}

// ─── Middleware de Autorização por Cargo (RBAC) ───────────────────────────────
// Retorna um middleware que verifica se o usuário possui o cargo necessário
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Garante que requireAuth foi executado antes
    if (!req.user) {
      return next(new AppError('Não autenticado', 401));
    }

    // Verifica se o cargo do usuário está na lista de cargos permitidos
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError('Acesso negado. Nível de permissão insuficiente.', 403)
      );
    }

    next(); // Usuário autorizado — continua para o controller
  };
}
