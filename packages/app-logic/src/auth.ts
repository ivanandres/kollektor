/** "Continuar con Google": turn the error codes that come back from the OAuth round trip into copy. */
export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'access_denied':
      return 'Cancelaste el ingreso con Google.';
    case 'not_configured':
      return 'El ingreso con Google no está disponible por ahora.';
    case 'account_not_linked':
      return 'Ya hay una cuenta con ese email. Entrá con tu contraseña.';
    default:
      return 'No pudimos entrar con Google. Probá de nuevo.';
  }
}

export type AppAuthResult =
  { ok: true; token: string } | { ok: false; error: string | null; message: string };

/**
 * The app's deep link after Google (`kolektorz://auth?state&token|error`). The state must be the
 * one the app generated for this attempt, so a link crafted elsewhere can't sign it into an account.
 */
export function parseAppAuthResult(url: string, expectedState: string): AppAuthResult {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return { ok: false, error: 'invalid', message: oauthErrorMessage('invalid')! };
  }
  if (params.get('state') !== expectedState)
    return { ok: false, error: 'state_mismatch', message: oauthErrorMessage('state_mismatch')! };
  const error = params.get('error');
  const token = params.get('token');
  if (error || !token) {
    const code = error ?? 'no_session';
    return { ok: false, error: code, message: oauthErrorMessage(code)! };
  }
  return { ok: true, token };
}
