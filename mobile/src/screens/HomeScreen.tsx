import { Pressable, StyleSheet, View } from 'react-native'
import { BudgetRing } from '../components/BudgetRing'
import { CategoryIcon } from '../components/CategoryIcon'
import { ScreenHeader } from '../components/Header'
import { Card, FitLine, Pill, ScreenScroll, T } from '../components/ui'
import { useTheme } from '../components/ThemeProvider'
import { formatPeso } from '../ui/format'
import type { HistoryRow, LedgerSnapshot } from '../ui/ledger'
import type { SyncPill } from '../ui/syncStatus'

export function HomeScreen({
  snapshot,
  pill,
  onOpenSettings,
  onOpenEntry,
  onEditBudget,
}: {
  snapshot: LedgerSnapshot
  pill: SyncPill
  onOpenSettings: () => void
  onOpenEntry: (row: HistoryRow) => void
  onEditBudget: () => void
}) {
  const { colors } = useTheme()
  const budgetLabel = snapshot.budget == null ? 'No budget yet' : `of ${formatPeso(snapshot.budget)}`
  return (
    <ScreenScroll testID="home-screen">
      <ScreenHeader title="Klaro" onAvatar={onOpenSettings} />
      <Card>
        <View style={styles.periodTop}>
          <View style={styles.periodCopy}>
            <T size={13} weight="bold" color={colors.muted}>This pay period</T>
            <T size={18} weight="bold">{snapshot.halfLabel}</T>
            <T size={14} color={colors.muted}>{snapshot.periodRange}</T>
          </View>
          <Pill label={pill.label} tone={pill.tone} />
        </View>
        <View style={styles.ringRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit pay period budget"
            testID="edit-budget"
            onPress={onEditBudget}
          >
            <BudgetRing spent={snapshot.spent} budget={snapshot.budget} />
          </Pressable>
          <View style={styles.spent}>
            <T size={13} weight="bold" color={colors.muted}>Spent</T>
            <FitLine size={26}>{formatPeso(snapshot.spent)}</FitLine>
            <T size={14} color={snapshot.overBudget ? colors.danger : colors.muted}>
              {snapshot.overBudget && snapshot.budget != null ? `Over by ${formatPeso(snapshot.spent - snapshot.budget)}` : budgetLabel}
            </T>
            <T size={14} color={colors.muted}>Income {formatPeso(snapshot.incomeTotal)}</T>
          </View>
        </View>
      </Card>
      <View style={styles.stats}>
        <Card style={styles.stat}>
          <T size={22} weight="bold">{snapshot.daysLogged}</T>
          <T size={12} color={colors.muted}>Days logged</T>
        </Card>
        <Card style={styles.stat}>
          {snapshot.topCategory ? <CategoryIcon name={snapshot.topCategory.icon} size={28} /> : null}
          <T size={13} weight="bold" numberOfLines={2}>{snapshot.topCategory?.name ?? 'None yet'}</T>
          <T size={12} color={colors.muted}>Top category</T>
        </Card>
        <Card style={styles.stat}>
          <T size={22} weight="bold">{snapshot.goalPercent == null ? '—' : `${snapshot.goalPercent}%`}</T>
          <T size={12} color={colors.muted} numberOfLines={2}>{snapshot.goalName ?? 'Goal'}</T>
        </Card>
      </View>
      <T size={18} weight="bold">Recent</T>
      {snapshot.recent.length === 0 ? (
        <Card>
          <T color={colors.muted}>No entries yet. Tap + to log one.</T>
        </Card>
      ) : (
        snapshot.recent.map((row) => (
          <EntryRow key={`${row.kind}-${row.id}`} row={row} onPress={() => onOpenEntry(row)} />
        ))
      )}
    </ScreenScroll>
  )
}

export function EntryRow({ row, onPress }: { row: HistoryRow; onPress?: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${row.amountLabel}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.entry,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <CategoryIcon name={row.icon} />
      <View style={styles.entryCopy}>
        <T weight="bold">{row.title}</T>
        <T size={13} color={colors.muted}>{row.detail} · {row.dateLabel}</T>
      </View>
      <T weight="bold">{row.amountLabel}</T>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  periodTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  periodCopy: {
    flex: 1,
    gap: 2,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  spent: {
    flex: 1,
    gap: 2,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    gap: 4,
    padding: 12,
    minHeight: 108,
    justifyContent: 'space-between',
  },
  entry: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 12,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryCopy: {
    flex: 1,
    gap: 2,
  },
})
