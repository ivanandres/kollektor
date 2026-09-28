import {
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/archivo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/queries';
import { c } from '@/lib/theme';

/** Sends signed-out users to /login and signed-in users away from it. */
function AuthGate() {
  const { data: session, isPending, error } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const offline = error instanceof ApiError && error.code === 'NETWORK';
  const onLogin = segments[0] === 'login';
  useEffect(() => {
    if (isPending || offline) return;
    if (!session && !onLogin) router.replace('/login');
    if (session && onLogin) router.replace('/');
  }, [isPending, offline, session, onLogin, router]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Archivo_400Regular, Archivo_600SemiBold, Archivo_800ExtraBold });
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (n, e) => n < 1 && (!(e instanceof ApiError) || e.retryable),
          },
        },
      }),
  );
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <StatusBar style="dark" />
          <AuthGate />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="agregar/index" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen name="agregar/manual" options={{ presentation: 'fullScreenModal' }} />
          </Stack>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
