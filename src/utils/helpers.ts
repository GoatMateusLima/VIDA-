/**
 * VIDA+ - Funções Utilitárias Auxiliares
 *
 * Este arquivo contém funções genéricas e reutilizáveis usadas em outras camadas.
 * Funções aqui são puras (sem efeito colateral) e facilmente testáveis.
 *
 * Funções disponíveis:
 *   - encryptMessage(text)      → Codifica uma mensagem antes de salvar no banco
 *   - decryptMessage(encrypted) → Decodifica uma mensagem do banco para exibição
 *   - generateAnonymousNickname → Gera apelido anônimo amigável para usuários sem nome
 *
 * Nota sobre criptografia:
 *   A implementação atual usa Base64 com um salt fixo para fins de demonstração.
 *   Em um ambiente de produção real, substituir por AES-256 com chave rotacionada
 *   armazenada em um Vault (ex: Supabase Vault ou AWS Secrets Manager).
 */

// ─── Criptografia de Mensagens ────────────────────────────────────────────────

/**
 * Codifica uma mensagem de texto para ser salva no banco de dados.
 * O conteúdo é combinado com um salt e convertido para Base64.
 *
 * @param text - Texto original da mensagem
 * @returns String codificada em Base64 para armazenar no banco
 */
export function encryptMessage(text: string): string {
  const secretSalt = 'vida_plus_secret_salt:';
  return Buffer.from(secretSalt + text).toString('base64');
}

/**
 * Decodifica uma mensagem armazenada no banco para exibição ao usuário.
 * Remove o salt antes de retornar o conteúdo original.
 *
 * @param encryptedText - String codificada em Base64 vinda do banco
 * @returns Texto original decodificado, ou mensagem de erro se a decodificação falhar
 */
export function decryptMessage(encryptedText: string): string {
  try {
    const decoded = Buffer.from(encryptedText, 'base64').toString('utf-8');
    const secretSalt = 'vida_plus_secret_salt:';
    if (decoded.startsWith(secretSalt)) {
      return decoded.replace(secretSalt, '');
    }
    return decoded;
  } catch (error) {
    // Retorna mensagem segura em caso de falha (não expõe detalhes internos)
    return '[Mensagem ilegível ou erro de descriptografia]';
  }
}

// ─── Gerador de Apelido Anônimo ───────────────────────────────────────────────

/**
 * Gera um apelido anônimo amigável para usuários sem identificação.
 * Usado para preservar a privacidade no dashboard do voluntário e no chat.
 *
 * @returns String no formato "Apoiado #XXXX"
 */
export function generateAnonymousNickname(): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `Apoiado #${randomNum}`;
}
