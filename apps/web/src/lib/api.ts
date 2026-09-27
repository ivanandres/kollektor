import { ApiError, createApiClient } from '@kollektor/api-client';

/** Same-origin client: Next proxies /api to the API, so the session cookie is first-party. */
export const api = createApiClient({ baseUrl: '/api' });

export { ApiError };

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Algo salió mal. Probá de nuevo.';
}
