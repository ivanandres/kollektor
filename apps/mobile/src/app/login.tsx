import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '@/components/T';
import { Cta, Field } from '@/components/ui';
import { api, errorMessage, tokenStore } from '@/lib/api';
import { keys } from '@/lib/queries';
import { c } from '@/lib/theme';

/** 1a — Login / registro. */
export default function Login() {
  const router = useRouter();
  const qc = useQueryClient();
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await tokenStore.clear();
      qc.clear();
      if (signup) {
        await api.auth.signUp({
          name: username.trim() || email.split('@')[0] || 'Coleccionista',
          email: email.trim(),
          password,
        });
        if (username.trim())
          await api.me.updateProfile({ username: username.trim() }).catch(() => {});
      } else {
        await api.auth.signIn({ email: email.trim(), password });
      }
      await qc.invalidateQueries({ queryKey: keys.session });
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setError(null);
    if (!email.trim())
      return setError('Escribí tu email y te mandamos un link para elegir otra contraseña.');
    try {
      const web = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://kolektorz.app';
      await api.auth.requestPasswordReset(email.trim(), `${web}/restablecer`);
      setNotice('Si el email está registrado, te llega un link para elegir una contraseña nueva.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const tab = (on: boolean, label: string, onPress: () => void, first: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        flex: 1,
        padding: 12,
        backgroundColor: on ? c.text : 'transparent',
        borderLeftWidth: first ? 0 : 1,
        borderLeftColor: c.divider,
      }}
    >
      <T size={14} weight={700} color={on ? c.bg : c.text}>
        {label}
      </T>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 28,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <T
            size={12}
            weight={600}
            color={c.accent}
            style={{ letterSpacing: 1.44, textTransform: 'uppercase' }}
          >
            Kolektorz
          </T>
          <T size={52} weight={800} lh={49.4} ls={-1.56} style={{ marginTop: 28 }}>
            {'Qué tenés.\nQué querés.\nCuánto vale.'}
          </T>
          <View
            style={{ height: 2, backgroundColor: c.divider, marginTop: 32, marginBottom: 24 }}
          />
          <View
            style={{
              flexDirection: 'row',
              borderWidth: 1,
              borderColor: c.divider,
              marginBottom: 20,
            }}
          >
            {tab(!signup, 'Iniciar sesión', () => setSignup(false), true)}
            {tab(signup, 'Crear cuenta', () => setSignup(true), false)}
          </View>
          <View style={{ gap: 14 }}>
            {signup ? (
              <Field
                label="Username"
                placeholder="ivan.discos"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
            ) : null}
            <Field
              label="Email"
              placeholder="ivan@mail.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              label="Contraseña"
              secureTextEntry
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
          </View>
          {signup ? (
            <T size={12} muted style={{ marginTop: 12 }}>
              Tu colección es privada por defecto. Podés hacerla pública desde Perfil.
            </T>
          ) : (
            <Pressable onPress={forgot} style={{ marginTop: 12 }}>
              <T size={13} color={c.accent} style={{ textDecorationLine: 'underline' }}>
                ¿Olvidaste tu contraseña?
              </T>
            </Pressable>
          )}
          {error ? (
            <T
              size={13}
              weight={600}
              color={c.a700}
              style={{ marginTop: 12 }}
              accessibilityRole="alert"
            >
              {error}
            </T>
          ) : null}
          {notice ? (
            <T size={13} style={{ marginTop: 12 }}>
              {notice}
            </T>
          ) : null}
          <View style={{ flex: 1, minHeight: 24 }} />
          <Cta label={signup ? 'Crear cuenta' : 'Entrar'} onPress={submit} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
