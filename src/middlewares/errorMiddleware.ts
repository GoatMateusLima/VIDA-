/**
 * VIDA+ - Middleware Global de Tratamento de Erros
 *
 * Este arquivo exporta duas coisas:
 *
 * 1. `AppError` (Classe de Erro Operacional)
 *    - Usada em todo o projeto para lançar erros com statusCode HTTP específico
 *    - Exemplos: throw new AppError('Não encontrado', 404)
 *               throw new AppError('Sem permissão', 403)
 *
 * 2. `errorMiddleware` (Middleware de 4 parâmetros do Express)
 *    - Captura TODOS os erros lançados por next(error) nas rotas/controllers
 *    - Classifica o tipo do erro e retorna uma resposta JSON padronizada
 *    - Tipos tratados:
 *        AppError     → erros operacionais conhecidos (404, 400, 401, 403, etc.)
 *        ZodError     → erros de validação de dados de entrada (400)
 *        Database     → erros de banco de dados (500)
 *        Outros       → erros inesperados (500)
 *
 * IMPORTANTE: deve ser registrado APÓS todas as rotas em src/app.ts
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

// ─── Classe de Erro Operacional ───────────────────────────────────────────────
// Permite lançar erros HTTP customizados de forma tipada em qualquer camada
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Middleware Global de Erros ───────────────────────────────────────────────
// O Express identifica middlewares de erro pela assinatura de 4 parâmetros (err, req, res, next)
export const errorMiddleware: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Loga o erro no servidor para monitoramento
  console.error(`[Error Handler] ${err.message}`, err);

  // ── Erro operacional conhecido (lançado com AppError) ──
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      requestId: res.locals.requestId,
    });
    return;
  }

  // ── Erro de validação de dados (lançado pelo Zod nos controllers) ──
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 'error',
      message: 'Erro de validação nos dados fornecidos',
      errors: err.errors, // Lista detalhada dos campos inválidos
      requestId: res.locals.requestId,
    });
    return;
  }

  // ── Erro de banco de dados (Supabase/PostgreSQL) ──
  if (err.message && err.message.includes('Database error')) {
    res.status(500).json({
      status: 'error',
      message: 'Erro de comunicação com o banco de dados.',
      requestId: res.locals.requestId,
    });
    return;
  }

  // ── Erro inesperado não tratado ──
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor. Por favor, tente novamente mais tarde.',
    requestId: res.locals.requestId,
  });
};
