import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '@/lib/theme';

/** Bottom sheet from the mockups (1f): dimmed backdrop, ink top rule. */
export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityLabel="Cerrar"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(45,43,43,0.45)' }}
        />
        <View
          accessibilityLabel={label}
          style={{
            maxHeight: '88%',
            backgroundColor: c.bg,
            borderTopWidth: 2,
            borderTopColor: c.text,
          }}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 20 + insets.bottom,
              gap: 14,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
