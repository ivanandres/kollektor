import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { completeGoogleSignIn } from '@/lib/googleAuth';
import { keys } from '@/lib/queries';
import { c } from '@/lib/theme';

/**
 * Landing for `kolektorz://auth?state&token|error` when the system opens the deep link as a route
 * (Android can do this besides returning it to the auth session). Finishes the sign-in if the
 * login screen didn't, then gets out of the way.
 */
export default function AuthReturn() {
  const params = useLocalSearchParams<{ state?: string; token?: string; error?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { state, token, error } = params;
  useEffect(() => {
    const query = new URLSearchParams();
    if (state) query.set('state', state);
    if (token) query.set('token', token);
    if (error) query.set('error', error);
    void completeGoogleSignIn(`kolektorz://auth?${query}`).then(async (result) => {
      if (result?.ok) {
        qc.clear();
        await qc.invalidateQueries({ queryKey: keys.session });
      }
      router.replace(result?.ok ? '/' : '/login');
    });
  }, [state, token, error, qc, router]);
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}
