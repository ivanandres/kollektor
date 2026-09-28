import { describe, expect, it } from 'vitest';
import { oauthErrorMessage, parseAppAuthResult } from './auth';

const STATE = 'abc-state-0123456789';

describe('parseAppAuthResult', () => {
  it('accepts the token only with the state this attempt generated', () => {
    expect(parseAppAuthResult(`kolektorz://auth?state=${STATE}&token=t0k`, STATE)).toEqual({
      ok: true,
      token: 't0k',
    });
    expect(parseAppAuthResult('kolektorz://auth?state=other&token=t0k', STATE)).toMatchObject({
      ok: false,
      error: 'state_mismatch',
    });
  });

  it('turns errors into Spanish copy', () => {
    expect(
      parseAppAuthResult(`kolektorz://auth?state=${STATE}&error=access_denied`, STATE),
    ).toEqual({ ok: false, error: 'access_denied', message: 'Cancelaste el ingreso con Google.' });
    expect(parseAppAuthResult(`kolektorz://auth?state=${STATE}`, STATE)).toMatchObject({
      ok: false,
      error: 'no_session',
    });
    expect(parseAppAuthResult('no es una url', STATE)).toMatchObject({ ok: false });
  });

  it('works with Expo Go links too', () => {
    expect(
      parseAppAuthResult(`exp://192.168.0.10:8081/--/auth?state=${STATE}&token=x`, STATE),
    ).toEqual({ ok: true, token: 'x' });
  });
});

describe('oauthErrorMessage', () => {
  it('has copy for every code and nothing without one', () => {
    expect(oauthErrorMessage(null)).toBeNull();
    expect(oauthErrorMessage('account_not_linked')).toMatch(/contraseña/);
    expect(oauthErrorMessage('whatever')).toBe('No pudimos entrar con Google. Probá de nuevo.');
  });
});
