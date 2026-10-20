import { roundMoney } from '../domain/money'

const FOOD = new Set(['Groceries', 'Dining Out'])

export function isFoodCategory(name: string): boolean {
  return FOOD.has(name)
}

export function foodTotal(rows: readonly { name: string; amount: number }[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + (isFoodCategory(row.name) ? row.amount : 0), 0))
}

export function homeInsight(input: {
  foodSpent: number
  previousFoodSpent: number
  topCategory: string | null
  daysLogged: number
  hasActivity: boolean
}): string | null {
  if (!input.hasActivity) return null
  if (input.previousFoodSpent > 0 && input.foodSpent > 0) {
    const ratio = (input.foodSpent - input.previousFoodSpent) / input.previousFoodSpent
    const pct = Math.round(Math.abs(ratio) * 100)
    if (pct === 0) return 'Food spending matches last kinsena'
    if (ratio < 0) return `You spent ${pct}% less on food than last kinsena`
    return `You spent ${pct}% more on food than last kinsena`
  }
  if (input.topCategory) return `${input.topCategory} is your biggest spend this kinsena`
  if (input.daysLogged > 0) {
    const noun = input.daysLogged === 1 ? 'day' : 'days'
    return `You've logged ${input.daysLogged} ${noun} this kinsena`
  }
  return null
}
