import { type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from './ThemeProvider'
import { GhostButton, T } from './ui'

export function Sheet({
  title,
  header,
  onClose,
  children,
  testID,
  tall,
}: {
  title?: string
  header?: ReactNode
  onClose: () => void
  children: ReactNode
  testID?: string
  tall?: boolean
}) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            testID={testID}
            style={[
              styles.sheet,
              tall ? styles.tall : null,
              { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {header ?? (
              <View style={styles.titleRow}>
                <T size={22} weight="bold">{title}</T>
                <GhostButton label="Close" onPress={onClose} />
              </View>
            )}
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(27, 26, 23, 0.35)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    maxHeight: '92%',
  },
  tall: {
    height: '94%',
    maxHeight: '94%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
