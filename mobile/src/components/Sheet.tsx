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
    <Modal visible transparent animationType="slide" onRequestClose={onClose} style={styles.layer}>
      <View style={styles.fill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={tall ? styles.tallHost : styles.shortHost}>
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
  layer: {
    zIndex: 40,
  },
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(27, 26, 23, 0.35)',
  },
  tallHost: {
    flex: 1,
    marginTop: 28,
    width: '100%',
  },
  shortHost: {
    width: '100%',
    maxHeight: '92%',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  tall: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
