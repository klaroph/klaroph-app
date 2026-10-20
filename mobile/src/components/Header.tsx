import { Pressable, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useTheme } from './ThemeProvider'
import { T } from './ui'

export function ScreenHeader({ title, onAvatar }: { title: string; onAvatar: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={styles.row}>
      <T size={28} weight="bold" color={colors.blue}>{title}</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        testID="open-settings"
        onPress={onAvatar}
        style={({ pressed }) => [styles.avatar, { backgroundColor: colors.blue, opacity: pressed ? 0.8 : 1 }]}
      >
        <MaterialCommunityIcons name="account" size={22} color={colors.onBlue} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
