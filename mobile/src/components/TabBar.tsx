import { Pressable, StyleSheet, View } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from './ThemeProvider'
import { T } from './ui'

export type TabId = 'home' | 'history' | 'goals'

const TABS: readonly { id: TabId; label: string; icon: 'home' | 'clock-outline' | 'flag-outline' }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'history', label: 'History', icon: 'clock-outline' },
  { id: 'goals', label: 'Goals', icon: 'flag-outline' },
]

export function TabBar({ tab, onTab, onAdd }: { tab: TabId; onTab: (tab: TabId) => void; onAdd: () => void }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        testID="tab-add"
        onPress={onAdd}
        style={({ pressed }) => [
          styles.add,
          {
            backgroundColor: colors.yellow,
            borderColor: colors.background,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={34} color={colors.onYellow} />
      </Pressable>
      <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((item) => {
          const selected = item.id === tab
          const icon = item.id === 'home' && selected ? 'home' : item.id === 'home' ? 'home-outline' : item.icon
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
              <MaterialCommunityIcons name={icon} size={22} color={selected ? colors.blue : colors.muted} />
              <T size={12} weight="bold" color={selected ? colors.blue : colors.muted}>{item.label}</T>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'visible',
  },
  bar: {
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  add: {
    position: 'absolute',
    top: -32,
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#FCD116',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
})
