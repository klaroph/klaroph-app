import type { CategoryIconName } from './categories'

export type StarterGoal = {
  name: string
  target: string
  detail: string
  icon: CategoryIconName
}

export const SUGGESTED_PERIOD_BUDGET = 10_000

export const STARTER_GOALS: readonly StarterGoal[] = [
  {
    name: 'Emergency fund',
    target: '30000',
    detail: '₱30,000 · 3 mo. of needs',
    icon: 'shield-check-outline',
  },
  {
    name: 'Christmas fund',
    target: '8000',
    detail: '₱8,000 by Dec 15',
    icon: 'airplane',
  },
]

export function starterGoalsLeft(existingNames: readonly string[]): StarterGoal[] {
  const have = new Set(existingNames.map((name) => name.trim().toLowerCase()))
  return STARTER_GOALS.filter((goal) => !have.has(goal.name.toLowerCase()))
}
