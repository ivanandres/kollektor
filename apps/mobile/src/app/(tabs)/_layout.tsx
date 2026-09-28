import { Tabs, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/components/T';
import { c } from '@/lib/theme';

const LABELS: Record<string, string> = {
  index: 'Inicio',
  coleccion: 'Colección',
  wishlist: 'Wishlist',
  perfil: 'Perfil',
};

/** Bottom bar from the mockups: 5 columns, the "+" in accent, active tab in accent with a 3px top mark. */
function TabBar({
  state,
  navigation,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (n: string) => void };
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routes = state.routes.filter((r) => LABELS[r.name]);
  const cell = (r: { key: string; name: string }) => {
    const on = state.routes[state.index]?.key === r.key;
    return (
      <Pressable
        key={r.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={LABELS[r.name]}
        onPress={() => navigation.navigate(r.name)}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderTopWidth: 3,
          borderTopColor: on ? c.accent : 'transparent',
        }}
      >
        <T size={11} weight={600} color={on ? c.accent : c.text}>
          {LABELS[r.name]}
        </T>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        height: 64 + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: 2,
        borderTopColor: c.divider,
        backgroundColor: c.bg,
      }}
    >
      {routes.slice(0, 2).map(cell)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar vinilo"
        onPress={() => router.push('/agregar')}
        style={({ pressed }) => ({
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? c.a600 : c.accent,
        })}
      >
        <T size={28} weight={800} color={c.bg}>
          +
        </T>
      </Pressable>
      {routes.slice(2).map(cell)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
      tabBar={(props) => <TabBar {...(props as unknown as Parameters<typeof TabBar>[0])} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="coleccion" />
      <Tabs.Screen name="wishlist" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
