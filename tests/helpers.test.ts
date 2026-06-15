import { describe, expect, it } from 'vitest';
import { decryptMessage, encryptMessage, hashPrivateValue } from '../src/utils/helpers';

describe('message encryption', () => {
  it('encrypts with authenticated encryption and decrypts the original text', () => {
    const encrypted = encryptMessage('mensagem confidencial');
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('mensagem confidencial');
    expect(decryptMessage(encrypted)).toBe('mensagem confidencial');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptMessage('original');
    expect(decryptMessage(`${encrypted.slice(0, -2)}xx`)).toContain('ilegível');
  });

  it('reads the legacy format during migration', () => {
    const legacy = Buffer.from('vida_plus_secret_salt:legado').toString('base64');
    expect(decryptMessage(legacy)).toBe('legado');
  });

  it('creates stable hashes without exposing the source value', () => {
    const first = hashPrivateValue('127.0.0.1');
    expect(first).toBe(hashPrivateValue('127.0.0.1'));
    expect(first).not.toContain('127.0.0.1');
  });
});
