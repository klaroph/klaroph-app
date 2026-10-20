import { useState } from 'react'
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
      <ToastLine message={message} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        testID="save-toast-undo"
        onPress={onUndo}
        style={styles.undo}
      >
        <T size={14} weight="bold" color="#FCD116">Undo</T>
      </Pressable>
    </View>
  )
}

function ToastLine({ message }: { message: string }) {
  const [width, setWidth] = useState(0)
  const size = width > 0 ? Math.max(9, Math.floor(width / (message.length * 0.52))) : 14
  const fitted = Math.min(14, size)
  const match = message.match(/^(.*?)(₱[\d,]+(?:\.\d+)?)(.*)$/)
  return (
    <View
      style={styles.message}
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width)
        setWidth((current) => (current === next ? current : next))
      }}
    >
      <T size={fitted} weight="bold" color="#F7F4EC" numberOfLines={1}>
        {match ? (
          <>
            {match[1]}
            <T size={fitted} weight="bold" color="#FCD116">{match[2]}</T>
            {match[3]}
          </>
        ) : message}
      </T>
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
    minWidth: 56,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: '#2E2C28',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
})
