import { Pressable, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useTheme } from './ThemeProvider'
import { T } from './ui'

export function SaveToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  const { colors } = useTheme()
  return (
    <View
      testID="save-toast"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.toast}
    >
      <View style={[styles.check, { backgroundColor: colors.ok }]}>
        <MaterialCommunityIcons name="check" size={16} color={colors.onBlue} />
      </View>
      <T size={14} weight="bold" color="#F7F4EC" style={styles.message}>{message}</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        testID="save-toast-undo"
        onPress={onUndo}
        style={styles.undo}
      >
        <T size={14} weight="bold" color="#F7F4EC">Undo</T>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1B1A17',
    borderRadius: 28,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 8,
    minHeight: 52,
    shadowColor: '#1B1A17',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
  },
  undo: {
    minWidth: 64,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: '#2E2C28',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
})
