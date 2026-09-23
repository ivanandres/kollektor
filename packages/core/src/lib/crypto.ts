import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM for secrets at rest (OAuth tokens). Key: 32 bytes, base64. Format: v1.iv.tag.data */
export function createCipher(base64Key: string) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)');
  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return [
        'v1',
        iv.toString('base64'),
        c.getAuthTag().toString('base64'),
        data.toString('base64'),
      ].join('.');
    },
    decrypt(payload: string): string {
      const [v, iv, tag, data] = payload.split('.');
      if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unknown ciphertext format');
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
    },
  };
}

export type Cipher = ReturnType<typeof createCipher>;
