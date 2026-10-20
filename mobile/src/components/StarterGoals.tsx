import { Pressable, StyleSheet, View } from 'react-native'
import { starterGoalsLeft, type StarterGoal } from '../ui/starters'
import { space } from '../ui/theme'
import { CategoryIcon } from './CategoryIcon'
import { useTheme } from './ThemeProvider'
import { Card, T } from './ui'

export function StarterGoals({
  existingNames,
  onAdd,
  onCustom,
}: {
  existingNames: readonly string[]
  onAdd: (goal: StarterGoal) => void
  onCustom?: () => void
}) {
  const { colors } = useTheme()
  const goals = starterGoalsLeft(existingNames)
  if (goals.length === 0 && !onCustom) return null
  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <T size={18} weight="bold">Starter goals</T>
        {onCustom ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Custom goal" onPress={onCustom}>
            <T weight="bold" color={colors.blue}>Custom</T>
          </Pressable>
        ) : null}
      </View>
      {goals.length > 0 ? (
        <View style={styles.row}>
          {goals.map((goal) => (
            <Card key={goal.name} style={styles.card}>
              <View style={styles.top}>
                <CategoryIcon name={goal.icon} size={36} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Add ${goal.name}`} onPress={() => onAdd(goal)} style={styles.add}>
                  <T size={14} weight="bold" color={colors.blue}>+ Add</T>
                </Pressable>
              </View>
              <T weight="bold">{goal.name}</T>
              <T size={12} color={colors.muted}>{goal.detail}</T>
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  card: {
    flex: 1,
    gap: 4,
    padding: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  add: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
})
