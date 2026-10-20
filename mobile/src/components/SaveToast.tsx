import { Pressable, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import LottieView from 'lottie-react-native'
import { useTheme } from './ThemeProvider'
import { T } from './ui'
import saveCheck from '../../assets/lottie/save_check.json'
import { SAVE_CHECK_DP } from '../ui/launchReveal'

export function SaveToast({
  message,
  onUndo,
  reduceMotion = false,
}: {
  message: string
  onUndo: () => void
  reduceMotion?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View
      testID="save-toast"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.toast}
    >
      {reduceMotion ? (
        <View testID="save-check-static" style={[styles.check, { backgroundColor: colors.ok }]}>
          <MaterialCommunityIcons name="check" size={16} color={colors.onBlue} />
        </View>
      ) : (
        <LottieView
          testID="save-check"
          source={saveCheck}
          autoPlay
          loop={false}
          resizeMode="contain"
          style={checkStyle}
          webStyle={checkStyle}
        />
      )}
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
  const match = message.match(/^(.*?)(₱[\d,]+(?:\.\d+)?)(.*)$/)
  return (
    <View style={styles.message}>
      <T size={15} weight="bold" color="#F7F4EC" numberOfLines={2}>
        {match ? (
          <>
            {match[1]}
            <T size={15} weight="bold" color="#FCD116">{match[2]}</T>
            {match[3]}
          </>
        ) : message}
      </T>
    </View>
  )
}

const checkStyle = { width: SAVE_CHECK_DP, height: SAVE_CHECK_DP }

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1B1A17',
    borderRadius: 28,
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 72,
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
    marginHorizontal: 8,
  },
  message: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
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
