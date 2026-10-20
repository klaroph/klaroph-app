import { StyleSheet, View } from 'react-native'
import { ScreenHeader } from '../components/Header'
import { useTheme } from '../components/ThemeProvider'
import { Banner, Card, GhostButton, PrimaryButton, ScreenScroll, T } from '../components/ui'
import type { GoalCard } from '../ui/ledger'

export function GoalsScreen({
  goals,
  banner,
  canAdd,
  onOpenSettings,
  onAdd,
  onDeposit,
  onEdit,
  onDelete,
}: {
  goals: GoalCard[]
  banner: string | null
  canAdd: boolean
  onOpenSettings: () => void
  onAdd: () => void
  onDeposit: (goal: GoalCard) => void
  onEdit: (goal: GoalCard) => void
  onDelete: (goal: GoalCard) => void
}) {
  const { colors } = useTheme()
  return (
    <ScreenScroll testID="goals-screen">
      <ScreenHeader title="Goals" onAvatar={onOpenSettings} />
      {banner ? <Banner message={banner} /> : null}
      {canAdd ? <PrimaryButton label="Add goal" onPress={onAdd} /> : null}
      {goals.length === 0 ? (
        <Card>
          <T color={colors.muted}>{"No goals yet. Add one to track what you're saving for."}</T>
        </Card>
      ) : (
        goals.map((goal) => (
          <Card key={goal.id}>
            <View style={styles.titleRow}>
              <T size={18} weight="bold" style={styles.name}>{goal.name}</T>
              <T weight="bold" color={colors.blue}>{goal.percentLabel}</T>
            </View>
            <View style={[styles.track, { backgroundColor: colors.blueSoft }]}>
              <View style={[styles.fill, { backgroundColor: colors.blue, width: `${Math.min(goal.percent, 100)}%` }]} />
            </View>
            <T size={13} color={colors.muted}>{goal.progressLabel}</T>
            <View style={styles.actions}>
              <PrimaryButton label="Deposit" onPress={() => onDeposit(goal)} />
              <View style={styles.side}>
                <GhostButton label="Edit" accessibilityLabel={`Edit ${goal.name}`} onPress={() => onEdit(goal)} />
                <GhostButton label="Delete" accessibilityLabel={`Delete ${goal.name}`} danger onPress={() => onDelete(goal)} />
              </View>
            </View>
          </Card>
        ))
      )}
    </ScreenScroll>
  )
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
  },
  track: {
    height: 8,
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 999,
  },
  actions: {
    marginTop: 12,
    gap: 4,
  },
  side: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
})
