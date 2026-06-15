/**
 * VIDA+ Backend - Ponto de entrada da aplicacao.
 */

import app from './app';
import { env } from './config/env';

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`API disponivel em http://localhost:${PORT}/api`);
});
