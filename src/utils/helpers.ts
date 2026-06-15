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
 * As mensagens novas usam AES-256-GCM. O leitor mantém compatibilidade temporária
 * com o formato Base64 legado para permitir migração gradual.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../config/env';

// ─── Criptografia de Mensagens ────────────────────────────────────────────────

const VERSION = 'v1';
const LEGACY_SALT = 'vida_plus_secret_salt:';

function encryptionKey(): Buffer {
  if (env.MESSAGE_ENCRYPTION_KEY) {
    const key = Buffer.from(env.MESSAGE_ENCRYPTION_KEY, 'base64');
    if (key.length !== 32) {
      throw new Error('MESSAGE_ENCRYPTION_KEY deve conter exatamente 32 bytes.');
    }
    return key;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('MESSAGE_ENCRYPTION_KEY não configurada.');
  }

  return createHash('sha256').update('vida-plus-development-only-key').digest();
}

export function encryptMessage(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
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
    if (encryptedText.startsWith(`${VERSION}.`)) {
      const [, ivEncoded, tagEncoded, ciphertextEncoded] = encryptedText.split('.');
      if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
        throw new Error('Formato criptografado inválido.');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        Buffer.from(ivEncoded, 'base64')
      );
      decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextEncoded, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    }

    const decoded = Buffer.from(encryptedText, 'base64').toString('utf-8');
    if (decoded.startsWith(LEGACY_SALT)) {
      return decoded.slice(LEGACY_SALT.length);
    }
    throw new Error('Formato legado inválido.');
  } catch {
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

export function hashPrivateValue(value: string): string {
  return createHash('sha256')
    .update(encryptionKey())
    .update(value)
    .digest('hex');
}
