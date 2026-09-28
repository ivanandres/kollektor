import type { Profile } from '@kollektor/api-client';
import type { ProfileUpdateInput } from '@kollektor/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, Share, View } from 'react-native';
import { CURRENCIES } from '@/components/CopyForm';
import { Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { Chip, Cta, Field, hair, rule, Segmented } from '@/components/ui';
import { api, errorMessage, tokenStore } from '@/lib/api';
import { useDashboardVariant } from '@/lib/prefs';
import { keys, useInvalidateAll, useProfile, useSession } from '@/lib/queries';
import { c, mono } from '@/lib/theme';

const WEB = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://kolektorz.app';

/** Perfil: accesos, privacidad, preferencias y cuenta (import/export e historia completa en la web). */
export default function ProfileScreen() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const { data: session } = useSession();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (n: string) => setOpen((o) => ({ ...o, [n]: !o[n] }));
  const link = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={[
        {
          paddingHorizontal: 20,
          paddingVertical: 14,
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
        hair,
      ]}
    >
      <T size={15} weight={700}>
        {label}
      </T>
      <T size={15} color={c.accent}>
        →
      </T>
    </Pressable>
  );
  return (
    <Screen>
      <View
        style={[
          {
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 16,
            flexDirection: 'row',
            gap: 14,
            alignItems: 'center',
          },
          rule,
        ]}
      >
        <View style={{ width: 64, height: 64, backgroundColor: c.n300 }} />
        <View style={{ flex: 1 }}>
          <T size={26} weight={800} ls={-0.5}>
            {profile?.displayName || profile?.username || 'Perfil'}
          </T>
          <T size={13} muted numberOfLines={1}>
            @{profile?.username} · {session?.user.email}
          </T>
        </View>
      </View>
      {link('Logros', () => router.push('/logros'))}
      {link('Estadísticas (en la web)', () => Linking.openURL(`${WEB}/estadisticas`))}
      {link('Importar de Discogs o CSV (en la web)', () =>
        Linking.openURL(`${WEB}/perfil#importar`),
      )}
      <View style={{ borderTopWidth: 1, borderTopColor: c.divider }}>
        <Section
          n="01"
          title="Tu perfil"
          sub="Nombre y username"
          open={!!open['01']}
          onToggle={() => toggle('01')}
        >
          {profile ? <ProfileForm profile={profile} /> : null}
        </Section>
        <Section
          n="02"
          title="Privacidad"
          sub="Todo es privado hasta que lo hagas público"
          open={!!open['02']}
          onToggle={() => toggle('02')}
        >
          {profile ? <Privacy profile={profile} /> : null}
        </Section>
        <Section
          n="03"
          title="Preferencias"
          sub="Moneda base y vista de Inicio"
          open={!!open['03']}
          onToggle={() => toggle('03')}
        >
          {profile ? <Preferences profile={profile} /> : null}
        </Section>
        <Section
          n="04"
          title="Cuenta"
          sub="Cerrar sesión o borrar tu cuenta"
          open={!!open['04']}
          onToggle={() => toggle('04')}
        >
          <Account />
        </Section>
      </View>
    </Screen>
  );
}

function Section({
  n,
  title,
  sub,
  open,
  onToggle,
  children,
}: {
  n: string;
  title: string;
  sub: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={rule}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 16,
        }}
      >
        <T size={12} weight={600} color={c.accent} style={{ width: 28, fontFamily: mono }}>
          {n}
        </T>
        <View style={{ flex: 1 }}>
          <T size={17} weight={800}>
            {title}
          </T>
          <T size={12} muted>
            {sub}
          </T>
        </View>
        <T size={20} weight={600}>
          {open ? '−' : '+'}
        </T>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>{children}</View>
      ) : null}
    </View>
  );
}

function useSave() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (patch: ProfileUpdateInput, done = 'Guardado.') => {
    try {
      qc.setQueryData(keys.profile, await api.me.updateProfile(patch));
      toast.show(done);
      return true;
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      return false;
    }
  };
}

function ProfileForm({ profile }: { profile: Profile }) {
  const save = useSave();
  const [name, setName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username);
  return (
    <>
      <Field label="Nombre" value={name} onChangeText={setName} />
      <Field label="Username" autoCapitalize="none" value={username} onChangeText={setUsername} />
      <Cta
        label="Guardar"
        end="✓"
        onPress={() =>
          save({
            displayName: name.trim() || null,
            ...(username.trim() !== profile.username ? { username: username.trim() } : {}),
          } as ProfileUpdateInput)
        }
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T size={14} style={{ flex: 1 }}>
        {label}
      </T>
      <View style={{ width: 180 }}>{children}</View>
    </View>
  );
}

function Privacy({ profile }: { profile: Profile }) {
  const save = useSave();
  const vis: ['private' | 'public', string][] = [
    ['private', 'Privado'],
    ['public', 'Público'],
  ];
  const yn: ['no' | 'si', string][] = [
    ['no', 'Ocultar'],
    ['si', 'Mostrar'],
  ];
  const url = `${WEB}/u/${profile.username}`;
  return (
    <>
      <Row label="Perfil">
        <Segmented
          options={vis}
          value={profile.profileVisibility}
          onChange={(v) => save({ profileVisibility: v })}
        />
      </Row>
      <Row label="Colección">
        <Segmented
          options={vis}
          value={profile.collectionVisibility}
          onChange={(v) => save({ collectionVisibility: v })}
        />
      </Row>
      <Row label="Wishlist">
        <Segmented
          options={vis}
          value={profile.wishlistVisibility}
          onChange={(v) => save({ wishlistVisibility: v })}
        />
      </Row>
      <Row label="Precios pagados">
        <Segmented
          options={yn}
          value={profile.showPrices ? 'si' : 'no'}
          onChange={(v) => save({ showPrices: v === 'si' })}
        />
      </Row>
      <Row label="Valores estimados">
        <Segmented
          options={yn}
          value={profile.showValues ? 'si' : 'no'}
          onChange={(v) => save({ showValues: v === 'si' })}
        />
      </Row>
      <T size={12} muted>
        La ubicación física y el lugar de compra nunca se publican.
      </T>
      {profile.profileVisibility === 'public' ? (
        <Pressable
          onPress={() => Share.share({ message: url, url })}
          style={{
            backgroundColor: c.surface,
            padding: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <T size={13} numberOfLines={1} style={{ flex: 1 }}>
            {url.replace(/^https?:\/\//, '')}
          </T>
          <T size={13} weight={600} color={c.a700}>
            Compartir
          </T>
        </Pressable>
      ) : null}
    </>
  );
}

function Preferences({ profile }: { profile: Profile }) {
  const save = useSave();
  const invalidate = useInvalidateAll();
  const [variant, setVariant] = useDashboardVariant();
  return (
    <>
      <T size={14}>Moneda base</T>
      <T size={12} muted>
        Cambiarla recalcula toda la colección.
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[...new Set([profile.baseCurrency, ...CURRENCIES])].map((cur) => (
          <Chip
            key={cur}
            label={cur}
            on={profile.baseCurrency === cur}
            onPress={async () =>
              (await save({ baseCurrency: cur }, `Ahora ves todo en ${cur}.`)) && invalidate()
            }
          />
        ))}
      </View>
      <Row label="Inicio">
        <Segmented
          options={[
            ['progreso', 'Progreso'],
            ['numeros', 'Números'],
          ]}
          value={variant}
          onChange={setVariant}
        />
      </Row>
      <T size={12} muted>
        Progreso: discografías, logros y recomendaciones. Números: totales, décadas y “tu colección
        en números”.
      </T>
    </>
  );
}

function Account() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  async function out() {
    await tokenStore.clear();
    qc.clear();
    router.replace('/login');
  }
  async function signOut() {
    await api.auth.signOut().catch(() => {});
    await out();
  }
  function confirmDelete() {
    Alert.alert(
      '¿Borrar tu cuenta?',
      'Se eliminan tu colección, tu wishlist, tus cargas manuales y tus fotos. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.auth.deleteAccount(password);
              await out();
            } catch (e) {
              toast.show(errorMessage(e), 'error');
              setBusy(false);
            }
          },
        },
      ],
    );
  }
  return (
    <>
      <Cta variant="secondary" label="Cerrar sesión" onPress={signOut} />
      {deleting ? (
        <>
          <T size={13}>
            Para confirmar, escribí tu contraseña. Si querés una copia, exportá tu colección desde
            la web antes.
          </T>
          <Field
            label="Tu contraseña"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Cta label="Borrar mi cuenta" disabled={!password} busy={busy} onPress={confirmDelete} />
        </>
      ) : (
        <Pressable onPress={() => setDeleting(true)}>
          <T size={13} color={c.a700}>
            Borrar mi cuenta
          </T>
        </Pressable>
      )}
    </>
  );
}
