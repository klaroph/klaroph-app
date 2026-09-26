import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

describe('dashboard data ownership', () => {
  it('fetches the selected month once in the page and shares it with the snapshot strip and budget card', () => {
    const page = read('app/dashboard/page.tsx')
    expect(page).toContain('useDashboardMonthMoney(budgetMonth, refreshTrigger)')
    expect(page).toMatch(/<BudgetOverview\s+spendingByCategory=\{monthMoney\?\.spendingByCategory \?\? null\}/)
    expect(read('components/dashboard/DashboardMonthStatStrip.tsx')).not.toMatch(/supabase|fetch\(/)
  })

  it('derives the goals page count from the goal list instead of a second goals query', () => {
    expect(read('app/dashboard/goals/page.tsx')).not.toMatch(/from\('goals'\)/)
    expect(read('components/goals/GoalList.tsx')).not.toMatch(/supabase|useEffect/)
  })
})

describe('dashboard layout stability', () => {
  it('renders first-viewport dashboard cards directly (no dynamic placeholder that sizes differently)', () => {
    const page = read('app/dashboard/page.tsx')
    expect(page).not.toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/dashboard\/(GoalMomentumSection|DashboardFinancialTrend)'\)/)
  })
})

describe('lazy-loaded bundles', () => {
  it('keeps the upgrade and payment modals out of the dashboard layout bundle until opened', () => {
    const layout = read('app/dashboard/DashboardLayoutClient.tsx')
    expect(layout).not.toMatch(/^import .*components\/dashboard\/(UpgradeModal|PaymentQRModal)/m)
    expect(layout).toMatch(/dynamic\(\(\) => import\('..\/..\/components\/dashboard\/UpgradeModal'\)/)
    expect(layout).toMatch(/dynamic\(\(\) => import\('..\/..\/components\/dashboard\/PaymentQRModal'\)/)
  })
})
