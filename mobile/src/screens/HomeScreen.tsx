import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { BudgetRing } from '../components/BudgetRing'
import { CategoryIcon } from '../components/CategoryIcon'
import { ScreenHeader } from '../components/Header'
import { StarterGoals } from '../components/StarterGoals'
import { Card, FitLine, ScreenScroll, T, YellowButton } from '../components/ui'
import { useTheme } from '../components/ThemeProvider'
import { formatPeso, formatPesoShort, signedPeso } from '../ui/format'
import { rowHeadline, rowSignedAmount } from '../ui/historyGroups'
import { homeInsight } from '../ui/insight'
import type { HistoryRow, LedgerSnapshot } from '../ui/ledger'
import { dailyAllowance, daysToPaydayOn, elapsedPeriodDays, kinsenaRange, paydayCardTitle } from '../ui/payday'
import { moneyLeft } from '../ui/saveToast'
import { SUGGESTED_PERIOD_BUDGET, type StarterGoal } from '../ui/starters'
import type { SyncPill } from '../ui/syncStatus'
import { space } from '../ui/theme'

export function HomeScreen({
  snapshot,
  pill,
  greeting,
  onOpenSettings,
  onOpenEntry,
  onEditBudget,
  onUseSuggestedBudget,
  onSeeAll,
  onAdd,
  onAddStarter,
  onCustomGoal,
}: {
  snapshot: LedgerSnapshot
  pill: SyncPill
  greeting: string
  onOpenSettings: () => void
  onOpenEntry: (row: HistoryRow) => void
  onEditBudget: () => void
  onUseSuggestedBudget: () => void
  onSeeAll: () => void
  onAdd: () => void
  onAddStarter: (goal: StarterGoal) => void
  onCustomGoal: () => void
}) {
  const { colors } = useTheme()
  const noActivity = snapshot.recent.length === 0 && snapshot.spent === 0 && snapshot.incomeTotal === 0
  const noBudget = snapshot.budget == null
  const heading = noActivity && noBudget ? 'Welcome' : greeting
  const payday = daysToPaydayOn(snapshot.today)
  const paydayTitle = paydayCardTitle(snapshot.today)
  const paydayToday = paydayTitle === 'Payday today'
  const left = moneyLeft(snapshot.budget, snapshot.spent)
  const perDay = left == null ? null : dailyAllowance(left, payday.days)
  const elapsed = elapsedPeriodDays(snapshot.period, snapshot.today)
  const insight = homeInsight({
    foodSpent: snapshot.foodSpent,
    previousFoodSpent: snapshot.previousFoodSpent,
    topCategory: snapshot.topCategory?.name ?? null,
    daysLogged: snapshot.daysLogged,
    hasActivity: !noActivity,
  })
  const ticks = paydayTicks(elapsed, payday.days)
  return (
    <ScreenScroll testID="home-screen">
      <ScreenHeader title="Klaro." greeting={heading} pill={pill} onAvatar={onOpenSettings} />
      {noBudget ? (
        <View style={[styles.hero, styles.heroCompact, { backgroundColor: colors.blue }]}>
          <View style={styles.blob} />
          <T size={12} weight="bold" color="rgba(255,255,255,0.78)" style={styles.kicker}>
            {`THIS KINSENA · ${kinsenaRange(snapshot.period)}`}
          </T>
          <T size={26} weight="bold" color={colors.onBlue}>Set a budget for this pay period</T>
          <T size={15} color="rgba(255,255,255,0.86)">{`We'll show what's left until ${payday.paydayLabel}.`}</T>
          <View style={styles.heroActions}>
            <View style={styles.heroButton}>
              <YellowButton label="Set budget" onPress={onEditBudget} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use ${formatPesoShort(SUGGESTED_PERIOD_BUDGET)}`}
              onPress={onUseSuggestedBudget}
              style={styles.suggest}
            >
              <T weight="bold" color={colors.onBlue} center>{`Use ${formatPesoShort(SUGGESTED_PERIOD_BUDGET)}`}</T>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.hero, { backgroundColor: colors.blue }]}>
          <View style={styles.heroTop}>
            <T size={12} weight="bold" color="rgba(255,255,255,0.78)" style={styles.kicker}>
              {`THIS KINSENA · ${kinsenaRange(snapshot.period)}`}
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit pay period budget" testID="edit-budget" onPress={onEditBudget} style={styles.budgetPill}>
              <T size={12} weight="bold" color={colors.onBlue}>{`Budget ${formatPesoShort(snapshot.budget ?? 0)}`}</T>
            </Pressable>
          </View>
          <View style={styles.ringRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit pay period budget" onPress={onEditBudget}>
              <BudgetRing spent={snapshot.spent} budget={snapshot.budget} tone="hero" />
            </Pressable>
            <View style={styles.leftCopy}>
              <T size={14} weight="semibold" color="rgba(255,255,255,0.82)">Money left</T>
              <FitLine size={28} color={colors.yellow}>{left == null ? formatPeso(0) : formatPeso(left)}</FitLine>
              <T size={13} color="rgba(255,255,255,0.88)">
                {`Spent ${formatPesoShort(snapshot.spent)} of ${formatPesoShort(snapshot.budget ?? 0)}`}
              </T>
              {perDay != null ? (
                <T size={13} color="rgba(255,255,255,0.82)">
                  {`≈ ${formatPesoShort(perDay)}/day for ${payday.days} ${payday.days === 1 ? 'day' : 'days'}`}
                </T>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <Card>
        <View style={styles.payday}>
          <View style={[styles.paydayIcon, { backgroundColor: '#FFF4C2' }]}>
            <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#8A6A00" />
          </View>
          <View style={styles.paydayCopy}>
            <T size={16} weight="bold" numberOfLines={1}>{paydayTitle}</T>
            <T size={13} color={colors.muted} numberOfLines={1}>
              {noActivity && noBudget ? 'Paydays: 15th and last day' : paydayToday ? '15th and last day' : `Payday ${payday.paydayLabel}`}
            </T>
          </View>
          {noActivity && noBudget ? null : (
            <View style={styles.ticks}>
              {ticks.map((filled, index) => (
                <View key={index} style={[styles.tick, { backgroundColor: filled ? colors.blue : colors.border }]} />
              ))}
            </View>
          )}
        </View>
      </Card>

      {insight ? (
        <View style={[styles.insight, { backgroundColor: colors.okSoft }]}>
          <MaterialCommunityIcons name="trending-down" size={18} color={colors.ok} />
          <T size={14} weight="semibold" color={colors.ok} numberOfLines={1} style={styles.insightText}>{insight}</T>
        </View>
      ) : null}

      {noActivity ? <FirstExpensePrompt onPress={onAdd} /> : null}

      <View style={styles.stats}>
        <Card style={[styles.stat, noActivity ? styles.statCompact : null]}>
          <T size={22} weight="bold" color={colors.blue}>
            {noActivity || snapshot.daysLogged === 0 ? 'Day 1' : `${snapshot.daysLogged}/${Math.max(elapsed, snapshot.daysLogged)}`}
          </T>
          <T size={12} color={colors.muted}>{noActivity || snapshot.daysLogged === 0 ? 'Start a streak today' : 'Days logged'}</T>
        </Card>
        <Card style={[styles.stat, noActivity ? styles.statCompact : null]}>
          {snapshot.topCategory ? (
            <>
              <CategoryIcon name={snapshot.topCategory.icon} size={28} />
              <T size={13} weight="bold" numberOfLines={2}>{snapshot.topCategory.name}</T>
              <T size={12} color={colors.muted}>{`Top · ${formatPesoShort(snapshot.topCategory.amount)}`}</T>
            </>
          ) : (
            <>
              <T size={16} weight="bold" color={colors.blue}>Top spend</T>
              <T size={12} color={colors.muted}>Shows after 3 entries</T>
            </>
          )}
        </Card>
        <Card style={[styles.stat, noActivity ? styles.statCompact : null]}>
          {snapshot.goalPercent == null ? (
            <>
              <T size={16} weight="bold" color={colors.blue}>No goal</T>
              <T size={12} color={colors.muted}>{noActivity ? 'Pick one below' : 'Add one in Goals'}</T>
            </>
          ) : (
            <>
              <T size={22} weight="bold" color={colors.blue}>{`${snapshot.goalPercent}%`}</T>
              <T size={12} color={colors.muted} numberOfLines={2}>{snapshot.goalName ?? 'Goal'}</T>
              <View style={[styles.track, { backgroundColor: colors.blueSoft }]}>
                <View style={[styles.fill, { backgroundColor: colors.yellow, width: `${Math.min(snapshot.goalPercent, 100)}%` }]} />
              </View>
            </>
          )}
        </Card>
      </View>

      {noActivity ? null : (
        <View style={styles.recentBlock}>
          <View style={styles.recentHead}>
            <T size={18} weight="bold">Recent</T>
            <Pressable accessibilityRole="button" accessibilityLabel="See all" onPress={onSeeAll}>
              <T weight="bold" color={colors.blue}>See all</T>
            </Pressable>
          </View>
          <Card style={styles.recentCard}>
            {snapshot.recent.map((row, index) => (
              <EntryRow key={`${row.kind}-${row.id}`} row={row} grouped divider={index < snapshot.recent.length - 1} onPress={() => onOpenEntry(row)} />
            ))}
          </Card>
        </View>
      )}

      {noActivity ? (
        <StarterGoals existingNames={snapshot.goals.map((goal) => goal.name)} onAdd={onAddStarter} onCustom={onCustomGoal} />
      ) : null}
    </ScreenScroll>
  )
}

function FirstExpensePrompt({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme()
  const [box, setBox] = useState({ width: 0, height: 0 })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Log your first expense"
      onPress={onPress}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        const next = { width: Math.round(width), height: Math.round(height) }
        setBox((current) => (current.width === next.width && current.height === next.height ? current : next))
      }}
      style={styles.first}
    >
      {box.width > 0 ? (
        <Svg width={box.width} height={box.height} style={styles.dash} pointerEvents="none">
          <Rect
            x={1}
            y={1}
            width={Math.max(box.width - 2, 0)}
            height={Math.max(box.height - 2, 0)}
            rx={24}
            ry={24}
            fill="none"
            stroke="#C4BBA8"
            strokeWidth={1.5}
            strokeDasharray="7 6"
          />
        </Svg>
      ) : null}
      <View style={[styles.plus, { backgroundColor: colors.yellow }]}>
        <T size={22} weight="bold" color={colors.onYellow}>+</T>
      </View>
      <View style={styles.firstCopy}>
        <T weight="bold">Log your first expense</T>
        <T size={13} color={colors.muted}>Tap + · takes about 3 seconds</T>
      </View>
    </Pressable>
  )
}

let ignoreNextEntryPress = false

/** A swipe should not also count as a tap on the row. */
export function ignoreEntryPressAfterSwipe(): void {
  ignoreNextEntryPress = true
}

export function resetEntryPressIgnore(): void {
  ignoreNextEntryPress = false
}

function entryPressIgnored(): boolean {
  if (!ignoreNextEntryPress) return false
  ignoreNextEntryPress = false
  return true
}

export function EntryRow({
  row,
  onPress,
  grouped,
  divider,
}: {
  row: HistoryRow
  onPress?: () => void
  grouped?: boolean
  divider?: boolean
}) {
  const { colors } = useTheme()
  const note = row.description.trim()
  const headline = rowHeadline(row)
  const sub = note ? row.category : row.kind === 'income' ? 'Income' : ''
  const amount = signedPeso(rowSignedAmount(row))
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${row.title}`}
      onPress={() => {
        if (entryPressIgnored()) return
        onPress?.()
      }}
      style={({ pressed }) => [
        grouped ? styles.grouped : styles.entry,
        grouped ? null : { backgroundColor: colors.card, borderColor: colors.border },
        divider ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <CategoryIcon name={row.icon} size={40} />
      <View style={styles.entryCopy}>
        <T weight="bold" numberOfLines={1}>{headline}</T>
        {sub ? <T size={13} color={colors.muted} numberOfLines={1}>{sub}</T> : null}
      </View>
      <T weight="bold" color={row.kind === 'income' ? colors.ok : colors.text}>{amount}</T>
    </Pressable>
  )
}

function paydayTicks(elapsed: number, daysLeft: number): boolean[] {
  const total = Math.max(elapsed + daysLeft, 1)
  const filled = Math.round((elapsed / total) * 12)
  return Array.from({ length: 12 }, (_, index) => index < filled)
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 28,
    padding: space.lg,
    gap: space.sm,
    overflow: 'hidden',
  },
  heroCompact: {
    padding: space.md,
    gap: 6,
  },
  blob: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -40,
    top: -30,
  },
  kicker: {
    letterSpacing: 0.4,
  },
  heroActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  heroButton: {
    flex: 1,
  },
  suggest: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  budgetPill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  leftCopy: {
    flex: 1,
    gap: 2,
  },
  payday: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  paydayIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paydayCopy: {
    flex: 1,
    gap: 2,
  },
  ticks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 22,
  },
  tick: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  insight: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightText: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
    gap: space.sm,
  },
  stat: {
    flex: 1,
    gap: 4,
    padding: 12,
    minHeight: 108,
    justifyContent: 'space-between',
  },
  statCompact: {
    minHeight: 76,
    padding: 10,
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: {
    height: 6,
    borderRadius: 999,
  },
  dash: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  first: {
    borderRadius: 26,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent',
  },
  plus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstCopy: {
    flex: 1,
    gap: 2,
  },
  recentBlock: {
    gap: space.sm,
  },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentCard: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 0,
  },
  entry: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 12,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grouped: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  entryCopy: {
    flex: 1,
    gap: 2,
  },
})
