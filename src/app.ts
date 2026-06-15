/**
 * VIDA+ Backend - Configuração Central do Express
 *
 * Este arquivo configura a instância principal do Express com:
 * - CORS: permite requisições do frontend PWA (liberado para todas as origens em dev)
 * - express.json(): habilita leitura de corpo JSON nas requisições
 * - Rotas: importa e registra todas as rotas sob o prefixo /api
 * - Middleware de erros: captura e formata todos os erros da aplicação (deve ser o último)
 *
 * Hierarquia de rotas registradas em /api:
 *   /api/health           → verificação de saúde da API
 *   /api/auth/*           → autenticação (registro, login, logout)
 *   /api/users/*          → perfil do usuário logado (/me)
 *   /api/conversations/*  → atendimentos, fila, mensagens, risco
 *   /api/reports/*        → denúncias de voluntários/usuários
 *   /api/admin/*          → gestão administrativa de voluntários
 */

import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorMiddleware } from './middlewares/errorMiddleware';

const app = express();

// ─── Middlewares Globais ───────────────────────────────────────────────────────

// Habilita CORS para todas as origens (ajuste para o domínio do frontend em produção)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Habilita leitura de corpo JSON nas requisições
app.use(express.json());

// ─── Rotas Centrais ────────────────────────────────────────────────────────────

// Registra todas as rotas do projeto sob o prefixo /api
app.use('/api', routes);

// ─── Tratamento Global de Erros ───────────────────────────────────────────────

// Deve ser o ÚLTIMO middleware registrado para capturar todos os erros
app.use(errorMiddleware);

export default app;
