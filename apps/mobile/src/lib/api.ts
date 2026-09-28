import { ApiError, createApiClient } from '@kollektor/api-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'kz.session';

/** Session token: SecureStore on devices, localStorage when previewing on the web. */
export const tokenStore = {
  async get() {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(TOKEN_KEY, token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear() {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(TOKEN_KEY);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

/** API base, e.g. https://api.kolektorz.app/api (EXPO_PUBLIC_API_URL). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(
  /\/$/,
  '',
);

/** Bearer-token client: the token arrives in `set-auth-token` on sign-in/sign-up. */
export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => tokenStore.get(),
  onToken: (t) => tokenStore.set(t),
});

export { ApiError };

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Algo salió mal. Probá de nuevo.';
}
