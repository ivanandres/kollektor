import { parseAppAuthResult, type AppAuthResult } from '@kollektor/app-logic';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { API_URL, tokenStore } from './api';

/**
 * Android only for now: on iOS, offering Google requires also offering Sign in with Apple
 * (App Store guideline 4.8). The web preview of the app has the real web for that.
 */
export const GOOGLE_ON_THIS_PLATFORM = Platform.OS === 'android';

/** State of the attempt in progress; the deep link must bring it back unchanged. */
let pending: string | null = null;

/**
 * "Continuar con Google": the API runs the OAuth dance inside an auth browser session and sends
 * the session token back on `kolektorz://auth`. Returns null if the person closed the browser.
 */
export async function signInWithGoogle(): Promise<AppAuthResult | null> {
  const state = Crypto.randomUUID();
  pending = state;
  const redirect = Linking.createURL('auth');
  const url = `${API_URL}/mobile/google?${new URLSearchParams({ state, redirect })}`;
  const res = await WebBrowser.openAuthSessionAsync(url, redirect, {
    // Don't leave a Google/Kolektorz session behind in the phone's browser.
    preferEphemeralSession: true,
  });
  if (res.type !== 'success') {
    if (pending === state) pending = null;
    return null;
  }
  return completeGoogleSignIn(res.url);
}

/**
 * Stores the token from the deep link. Idempotent: on Android the link can reach both the auth
 * session and the `auth` route; whoever comes second gets null.
 */
export async function completeGoogleSignIn(url: string): Promise<AppAuthResult | null> {
  const state = pending;
  if (!state) return null;
  pending = null;
  const result = parseAppAuthResult(url, state);
  if (result.ok) await tokenStore.set(result.token);
  return result;
}
