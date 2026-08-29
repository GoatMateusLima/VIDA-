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
import helmet from 'helmet';
import routes from './routes';
import { errorMiddleware } from './middlewares/errorMiddleware';
import { AppError } from './middlewares/errorMiddleware';
import { apiLimiter, requestContext } from './middlewares/securityMiddleware';
import { corsOrigins, env } from './config/env';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);
app.use(requestContext);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const cleanOrigin = origin.trim().replace(/\/+$/, '');
    
    if (corsOrigins.includes(cleanOrigin) || corsOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    // Permite qualquer porta local (localhost e 127.0.0.1)
    if (/^https?:\/\/localhost(:\d+)?$/.test(cleanOrigin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin)) {
      callback(null, true);
      return;
    }

    // Permite subdomínios da Vercel e Netlify
    if (
      cleanOrigin.endsWith('.vercel.app') ||
      cleanOrigin.endsWith('.netlify.app') ||
      cleanOrigin === 'https://vercel.com'
    ) {
      callback(null, true);
      return;
    }

    callback(new Error('Origem não permitida pelo CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '32kb' }));
app.use(apiLimiter);

// Rotas raiz e de conveniência
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Backend Vida+ operacional',
    health: '/api/health',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Backend Vida+ operacional',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);
app.use((_req, _res, next) => next(new AppError('Rota não encontrada.', 404)));
app.use(errorMiddleware);

export default app;
