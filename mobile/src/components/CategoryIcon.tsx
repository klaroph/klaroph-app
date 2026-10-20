import { StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { CategoryIconName } from '../ui/categories'
import { useTheme } from './ThemeProvider'

const TINTS: Partial<Record<CategoryIconName, { bg: string; fg: string }>> = {
  'silverware-fork-knife': { bg: '#E7EEFB', fg: '#0038A8' },
  'cart-outline': { bg: '#E7EEFB', fg: '#0038A8' },
  bus: { bg: '#FFF4C2', fg: '#8A6A00' },
  'flash-outline': { bg: '#E5F6EC', fg: '#1F7A4D' },
  'shopping-outline': { bg: '#FDE8F1', fg: '#9D3B6E' },
  'account-group-outline': { bg: '#E7F4FB', fg: '#0B6E99' },
  airplane: { bg: '#E7EEFB', fg: '#0038A8' },
  'shield-check-outline': { bg: '#E5F6EC', fg: '#1F7A4D' },
  'home-outline': { bg: '#E7EEFB', fg: '#0038A8' },
}

export function CategoryIcon({ name, size = 40 }: { name: CategoryIconName; size?: number }) {
  const { colors } = useTheme()
  const tint = TINTS[name] ?? { bg: colors.blueSoft, fg: colors.blue }
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: 14, backgroundColor: tint.bg }]}>
      <MaterialCommunityIcons name={name} size={Math.round(size * 0.55)} color={tint.fg} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
