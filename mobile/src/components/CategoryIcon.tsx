import { StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { CategoryIconName } from '../ui/categories'
import { useTheme } from './ThemeProvider'

export function CategoryIcon({ name, size = 36 }: { name: CategoryIconName; size?: number }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: 14, backgroundColor: colors.blueSoft }]}>
      <MaterialCommunityIcons name={name} size={Math.round(size * 0.55)} color={colors.blue} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
