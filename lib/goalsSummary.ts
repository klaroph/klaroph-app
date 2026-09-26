export type GoalListItem = {
  id: string
  name: string
  target_amount: number
}

export type GoalSummary = {
  totalSaved: number
  totalTarget: number
  activeGoals: number
  overallPercent: number
  strongestGoal: { name: string; percent: number } | null
}

export const EMPTY_GOAL_SUMMARY: GoalSummary = {
  totalSaved: 0,
  totalTarget: 0,
  activeGoals: 0,
  overallPercent: 0,
  strongestGoal: null,
}

/** Goals page hero summary from the goal list and allocated totals per goal id. */
export function summarizeGoals(
  goals: ReadonlyArray<GoalListItem>,
  allocatedByGoal: Readonly<Record<string, number>>
): GoalSummary {
  const totalSaved = goals.reduce((sum, g) => sum + (allocatedByGoal[g.id] ?? 0), 0)
  const totalTarget = goals.reduce((sum, g) => sum + (Number(g.target_amount) || 0), 0)
  const overallPercent = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0
  const withPct = goals
    .map((g) => ({
      name: g.name,
      percent: (Number(g.target_amount) || 0) > 0
        ? Math.min(100, ((allocatedByGoal[g.id] ?? 0) / Number(g.target_amount)) * 100)
        : 0,
    }))
    .filter((x) => x.percent < 100)
    .sort((a, b) => b.percent - a.percent)
  const strongestGoal = withPct[0] ? { name: withPct[0].name, percent: withPct[0].percent } : null
  return {
    totalSaved,
    totalTarget,
    activeGoals: goals.length,
    overallPercent,
    strongestGoal,
  }
}
