import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './index';

const client = (status: number, body: unknown) =>
  createApiClient({
    baseUrl: 'http://api.test/api',
    fetch: async () => Response.json(body, { status }),
  });

describe('error messages', () => {
  it('translates Better Auth errors to Spanish', async () => {
    const api = client(401, {
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
    const e = await api.auth.signIn({ email: 'a@b.c', password: 'x' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).message).toBe('El email o la contraseña no son correctos.');
    expect((e as ApiError).code).toBe('UNAUTHORIZED');
  });

  it("keeps our API's own messages and falls back for unknown ones", async () => {
    const ours = client(409, { error: { code: 'CONFLICT', message: 'Ya lo tenés' } });
    await expect(ours.me.profile()).rejects.toThrow('Ya lo tenés');
    const limited = client(429, { message: 'Too many requests. Please try again later.' });
    await expect(limited.auth.signIn({ email: 'a@b.c', password: 'x' })).rejects.toThrow(
      'Demasiados intentos. Esperá un minuto y probá de nuevo.',
    );
  });
});
