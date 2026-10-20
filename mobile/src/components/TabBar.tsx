import { Pressable, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CategoryIconName } from '../ui/categories'
import { useTheme } from './ThemeProvider'
import { T } from './ui'

export type TabId = 'home' | 'history' | 'goals'

const TABS: readonly { id: TabId; label: string; icon: CategoryIconName | 'home' | 'history' }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'goals', label: 'Goals', icon: 'flag-outline' },
]

export function TabBar({ tab, onTab, onAdd }: { tab: TabId; onTab: (tab: TabId) => void; onAdd: () => void }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((item) => {
        const selected = item.id === tab
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            testID={`tab-${item.id}`}
            onPress={() => onTab(item.id)}
            style={styles.tab}
          >
            <MaterialCommunityIcons name={item.icon} size={22} color={selected ? colors.blue : colors.muted} />
            <T size={12} weight="bold" color={selected ? colors.blue : colors.muted}>{item.label}</T>
            <View style={[styles.mark, { backgroundColor: selected ? colors.yellow : 'transparent' }]} />
          </Pressable>
        )
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        testID="tab-add"
        onPress={onAdd}
        style={({ pressed }) => [
          styles.add,
          { backgroundColor: colors.yellow, borderColor: colors.background, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={32} color={colors.onYellow} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingTop: 36,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  mark: {
    width: 18,
    height: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  add: {
    position: 'absolute',
    top: -28,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
