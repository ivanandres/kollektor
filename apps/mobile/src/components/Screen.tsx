import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '@/lib/theme';

/** Scrollable screen on the Modernist background, below the status bar, with pull-to-refresh. */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
  header,
  ...rest
}: ScrollViewProps & {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  header?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {header}
      <ScrollView
        {...rest}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}
