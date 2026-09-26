export type CardInsightTone = 'positive' | 'negative' | 'neutral'

export type CardInsight = { tone: CardInsightTone; message: string }

/** Minimum % change worth calling out. */
const MIN_CHANGE_PCT = 1

function pctChange(first: number, last: number): number | null {
  if (first <= 0) return null
  const pct = ((last - first) / first) * 100
  return Math.abs(pct) < MIN_CHANGE_PCT ? null : pct
}

/**
 * Trend card insight from monthly totals (oldest → newest), comparing the first and
 * last of the most recent 3 months. Rising expenses are negative unless income grew faster;
 * falling expenses or rising income are positive.
 */
export function getTrendInsight(
  incomeByMonth: number[],
  expenseByMonth: number[],
  latestMonthLabel: string
): CardInsight | null {
  if (expenseByMonth.length < 3 || incomeByMonth.length < 3) return null
  const inc = incomeByMonth.slice(-3)
  const exp = expenseByMonth.slice(-3)
  if (inc.every((v) => v === 0) && exp.every((v) => v === 0)) return null

  const expChange = pctChange(exp[0], exp[2])
  const incChange = pctChange(inc[0], inc[2])
  const round = (n: number) => Math.round(Math.abs(n))

  if (expChange !== null) {
    if (expChange < 0) {
      return { tone: 'positive', message: `Expenses decreased by about ${round(expChange)}% over the last 3 months.` }
    }
    if (incChange !== null && incChange > expChange) {
      return {
        tone: 'positive',
        message: `Income grew about ${round(incChange)}% while expenses grew ${round(expChange)}% over the last 3 months.`,
      }
    }
    return { tone: 'negative', message: `Expenses increased by about ${round(expChange)}% over the last 3 months.` }
  }

  if (incChange !== null) {
    return incChange > 0
      ? { tone: 'positive', message: `Income increased by about ${round(incChange)}% over the last 3 months.` }
      : { tone: 'negative', message: `Income decreased by about ${round(incChange)}% over the last 3 months.` }
  }

  const latestIncome = inc[2]
  const latestExpense = exp[2]
  if (latestExpense > latestIncome) {
    return { tone: 'negative', message: `Expenses are higher than income in ${latestMonthLabel}.` }
  }
  if (latestIncome > latestExpense) {
    return { tone: 'positive', message: `Income is covering expenses in ${latestMonthLabel}.` }
  }
  return null
}

/** Financial Health card insight from asset / liability totals. */
export function getNetWorthInsight(assets: number, liabilities: number, hasAccounts: boolean): CardInsight {
  if (!hasAccounts) {
    return { tone: 'neutral', message: 'Add your assets and liabilities to see your net worth.' }
  }
  const net = assets - liabilities
  if (net > 0) return { tone: 'positive', message: 'Your net worth is positive. Keep building your assets.' }
  if (net < 0) return { tone: 'negative', message: 'Your liabilities are higher than your assets right now.' }
  return { tone: 'neutral', message: 'Your assets and liabilities are balanced.' }
}
