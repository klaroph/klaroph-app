import type Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { supabaseAuthStorageKey } from '../runtime/supabaseAuth'
import { openTestRepository } from '../db/testDb'
import type { KlaroDb } from '../db/repository'
import { schema } from '../db/schema'
import { manilaCivilDate } from '../domain/payPeriod'
import { FREE_GOAL_CAP_MESSAGE, GOAL_GRACE_BLOCK_MESSAGE, PRO_GOAL_CAP_MESSAGE, goalCapMessage } from '../domain/planLimits'
import { MemoryTokenStore } from '../sync/tokenStore'
import { emptyCounts } from '../sync/model'
import { signInAndAdopt, signOutKeepingIntro } from './accountFlow'
import { commitDeleteEntry, commitDeposit, commitEntry, commitGoal, commitPeriodBudget } from './actions'
import { monthlyBudget, prorateToPeriod, ringProgress } from './budgetMath'
import { FIRST_RUN_PAGES, FUTURE_DATE_MESSAGE, OLDER_ENTRIES_LINE, PERIOD_BUDGET_LINE, UNINSTALL_WARNING, unsyncedSignOutLine } from './copy'
import { canShiftEntryDate, historyCutoff, manilaToday } from './historyWindow'
import { hasUnsyncedChanges, loadLedger, pageHistory } from './ledger'
import { ScreenPrefs } from './prefs'
import { readPublicSupabaseConfig } from './publicConfig'
import { canSaveQuickAdd, categoryForNewEntry, emptyDraft, newEntryDraft, parseQuickAmount, sanitizeAmountInput } from './quickAdd'
import { canAddGoal, visibleGoalBanner } from './goalCopy'
import { reportLooksOffline, syncPill } from './syncStatus'
import { lightColors, radius } from './theme'

const NOW = new Date('2026-10-20T04:00:00.000Z')
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function prefsFor(sqlite: Database.Database) {
  return new ScreenPrefs(drizzle(sqlite, { schema }) as unknown as KlaroDb)
}

describe('screen palette', () => {
  it('uses Klaro blue and yellow on off-white cards', () => {
    expect(lightColors.blue).toBe('#0038A8')
    expect(lightColors.yellow).toBe('#FCD116')
    expect(lightColors.background).toBe('#F7F4EC')
    expect(radius.card).toBeGreaterThanOrEqual(24)
    expect(radius.card).toBeLessThanOrEqual(28)
    expect(FIRST_RUN_PAGES).toHaveLength(2)
    expect(FIRST_RUN_PAGES[1].points).toContain(UNINSTALL_WARNING)
  })
})

describe('free history window', () => {
  it('keeps a date that is 90 days old and hides the day before it', () => {
    expect(manilaToday(NOW)).toBe('2026-10-20')
    expect(historyCutoff(manilaCivilDate(NOW))).toBe('2026-07-22')
  })

  it('shows only the last 90 days on Free and leaves older rows stored', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    repo.createExpense({ userId: null, category: 'Groceries', type: 'needs', amount: 80, date: '2026-10-16' })
    repo.createExpense({ userId: null, category: 'Shopping', type: 'wants', amount: 9000, date: '2026-07-21' })
    const view = loadLedger(repo, NOW)
    expect(view.olderLineVisible).toBe(true)
    expect(pageHistory(repo, NOW, null).rows.map((row) => row.date)).toEqual(['2026-10-16'])
    expect(view.recent).toHaveLength(1)
    expect(view.topCategory?.name).toBe('Groceries')
    expect(repo.listLive('expenses', null)).toHaveLength(2)
    expect(() => commitDeleteEntry(repo, 'expense', repo.listLive('expenses', null).find((row) => row.values.date === '2026-07-21')!.id, NOW)).toThrow(OLDER_ENTRIES_LINE)
    expect(repo.listLive('expenses', null)).toHaveLength(2)
    expect(() => commitEntry(repo, { ...emptyDraft('2026-07-21'), amount: '10', date: '2026-07-21' }, NOW)).toThrow(OLDER_ENTRIES_LINE)
  })

  it('orders the same day by created_at, newest first', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    repo.setSessionUserId(USER)
    const row = (id: string, createdAt: string) => ({
      table: 'expenses' as const,
      id,
      user_id: USER,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
      values: {
        category: 'Groceries',
        type: 'needs',
        amount: '10.00',
        date: '2026-10-16',
        description: null,
      },
    })
    const earlierId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const laterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    repo.applyServerRows('expenses', [
      row(earlierId, '2026-10-16T01:00:00.000Z'),
      row(laterId, '2026-10-16T09:00:00.000Z'),
    ])
    expect(pageHistory(repo, NOW, null).rows.map((entry) => entry.id)).toEqual([laterId, earlierId])
    const first = pageHistory(repo, NOW, null, 1)
    expect(first.rows.map((entry) => entry.id)).toEqual([laterId])
    expect(pageHistory(repo, NOW, first.cursor, 1).rows.map((entry) => entry.id)).toEqual([earlierId])
  })

  it('lets a dated-on-the-cutoff expense through and shows every row on Pro', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    commitEntry(repo, { ...emptyDraft('2026-07-22'), amount: '15', date: '2026-07-22' }, NOW)
    expect(pageHistory(repo, NOW, null).rows).toHaveLength(1)
    repo.setSessionUserId(USER)
    repo.setKnownPlan({ name: 'Pro', maxGoals: 20 })
    const old = repo.createExpense({ userId: USER, category: 'Travel', type: 'wants', amount: 40, date: '2020-01-01' })
    const view = loadLedger(repo, NOW)
    expect(view.freeHistory).toBe(false)
    expect(view.olderLineVisible).toBe(false)
    expect(pageHistory(repo, NOW, null).rows.some((row) => row.id === old.id)).toBe(true)
    commitDeleteEntry(repo, 'expense', old.id, NOW)
    expect(repo.getRow('expenses', old.id)?.deleted_at).toBeTruthy()
  })
})

describe('home payday card', () => {
  it('prorates the monthly budget across the pay period and ignores spending outside it', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    repo.createBudgetPlan({ userId: null, category: 'Groceries', amount: 3100 })
    repo.createExpense({ userId: null, category: 'Groceries', type: 'needs', amount: 500, date: '2026-10-16' })
    repo.createExpense({ userId: null, category: 'Dining Out', type: 'wants', amount: 200, date: '2026-10-20' })
    repo.createExpense({ userId: null, category: 'Shopping', type: 'wants', amount: 5000, date: '2026-09-01' })
    repo.createIncome({ userId: null, totalAmount: 1000, date: '2026-10-16', incomeSource: 'Salary' })
    const view = loadLedger(repo, NOW)
    expect(view.period).toMatchObject({ half: 'b', month: '2026-10', start: '2026-10-15', end: '2026-10-30' })
    expect(view.budget).toBe(1600)
    expect(view.spent).toBe(700)
    expect(view.incomeTotal).toBe(1000)
    expect(view.ring).toBeCloseTo(700 / 1600)
    expect(view.overBudget).toBe(false)
    expect(view.daysLogged).toBe(2)
    expect(view.topCategory).toMatchObject({ name: 'Groceries', amount: 500 })
    const month = monthlyBudget('2026-10', [{ category: 'Groceries', amount: 1000 }, { category: 'Dining Out', amount: 1000 }], [
      { category: 'Groceries', amount: 310, month: '2026-10-01' },
    ])
    expect(prorateToPeriod(month.amount, view.period)).toBe(676.13)
    expect(ringProgress(2000, 1600)).toEqual({ progress: 1, over: true })
  })

  it('uses a phone-only pay period amount until category budgets exist', () => {
    const { sqlite, repo } = openTestRepository({ now: () => NOW })
    const prefs = prefsFor(sqlite)
    const start = '2026-10-15'
    expect(loadLedger(repo, NOW, prefs.periodBudget(start)).budget).toBeNull()
    commitPeriodBudget(prefs, start, '900')
    expect(prefs.periodBudget(start)).toBe(900)
    expect(loadLedger(repo, NOW, prefs.periodBudget(start)).budget).toBe(900)
    expect(PERIOD_BUDGET_LINE).toBe("This amount stays on this phone and doesn't sync.")
    repo.createBudgetPlan({ userId: null, category: 'Groceries', amount: 3100 })
    expect(loadLedger(repo, NOW, prefs.periodBudget(start)).budget).toBe(1600)
  })
})

describe('goals on screen', () => {
  it('uses deposits when they exist and saved_amount otherwise', () => {
    const { sqlite, repo } = openTestRepository({ now: () => NOW })
    const saved = repo.createGoal({ userId: null, name: 'Alpha', targetAmount: 100 })
    sqlite.prepare('update goals set saved_amount = ? where id = ?').run('40.00', saved.id)
    const pinned = repo.createGoal({ userId: null, name: 'Zebra', targetAmount: 100 })
    repo.updateGoal(pinned.id, { pinnedAt: '2026-10-01T00:00:00.000Z' })
    commitDeposit(repo, pinned.id, '25')
    const view = loadLedger(repo, NOW)
    const alpha = view.goals.find((goal) => goal.name === 'Alpha')
    const zebra = view.goals.find((goal) => goal.name === 'Zebra')
    expect(alpha).toMatchObject({ progress: 40, percent: 40 })
    expect(zebra).toMatchObject({ progress: 25, percent: 25 })
    expect(view.goalName).toBe('Zebra')
    expect(view.goalPercent).toBe(25)
    expect(view.capMessage).toBe(FREE_GOAL_CAP_MESSAGE)
    expect(view.capMessage).not.toMatch(/max_goals/i)
    expect(() => commitGoal(repo, { name: 'Third', target: '10' })).toThrow(FREE_GOAL_CAP_MESSAGE)
    repo.setSessionUserId(USER)
    repo.setKnownPlan({ name: 'Pro', maxGoals: 20 })
    expect(goalCapMessage(repo.knownPlan())).toBe(PRO_GOAL_CAP_MESSAGE)
    expect(PRO_GOAL_CAP_MESSAGE).not.toMatch(/max_goals/i)
  })

  it('surfaces the grace message ahead of the local cap', () => {
    expect(visibleGoalBanner({ grace: true, engineMessage: 'Free allows 2 goals; you have 1 here and 2 in your account. Remove some to continue.', capMessage: 'Goal count is already at the plan max_goals.' })).toBe(GOAL_GRACE_BLOCK_MESSAGE)
    expect(canAddGoal(GOAL_GRACE_BLOCK_MESSAGE)).toBe(false)
    expect(canAddGoal(null)).toBe(true)
  })
})

describe('quick add and sync pill', () => {
  it('parses an amount and keeps the default category ready to save', () => {
    expect(sanitizeAmountInput('12a.3.99')).toBe('12.39')
    expect(parseQuickAmount('₱1,200.50')).toBe(1200.5)
    expect(parseQuickAmount('0')).toBeNull()
    const draft = emptyDraft('2026-10-20')
    expect(draft.category).toBe('Groceries')
    expect(newEntryDraft('2026-10-20', 'expense', null).category).toBe('Groceries')
    expect(newEntryDraft('2026-10-20', 'income', null).category).toBe('Salary')
    expect(categoryForNewEntry('expense', 'Dining Out')).toBe('Dining Out')
    expect(categoryForNewEntry('income', 'Freelance / Online Work')).toBe('Freelance / Online Work')
    expect(canSaveQuickAdd({ ...draft, amount: '50' })).toBe(true)
    expect(canShiftEntryDate('2026-10-20', 1, '2026-10-20', '2026-07-22')).toBe(false)
    expect(canShiftEntryDate('2026-10-20', -1, '2026-10-20', '2026-07-22')).toBe(true)
    expect(canShiftEntryDate('2026-07-22', -1, '2026-10-20', '2026-07-22')).toBe(false)
    expect(syncPill({ signedIn: false, syncEnabled: true, syncing: false, offline: false, pending: true })).toEqual({ tone: 'local', label: 'On this phone' })
    expect(syncPill({ signedIn: true, syncEnabled: false, syncing: false, offline: false, pending: true })).toEqual({ tone: 'off', label: 'Sync off' })
    expect(syncPill({ signedIn: true, syncEnabled: true, syncing: false, offline: true, pending: true })).toEqual({ tone: 'offline', label: 'Offline' })
    expect(syncPill({ signedIn: true, syncEnabled: true, syncing: false, offline: false, pending: false })).toEqual({ tone: 'synced', label: 'Synced' })
    expect(syncPill({ signedIn: true, syncEnabled: true, syncing: true, offline: true, pending: true })).toEqual({
      tone: 'syncing',
      label: 'Syncing your entries…',
    })
    expect(reportLooksOffline({ errors: [{ message: 'Network request failed' }] })).toBe(true)
  })

  it('counts unassigned dirty rows after sign-in and ignores them before it', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    repo.createExpense({ userId: null, category: 'Groceries', type: 'needs', amount: 10, date: '2026-10-20' })
    expect(hasUnsyncedChanges(repo)).toBe(false)
    repo.setSessionUserId(USER)
    expect(hasUnsyncedChanges(repo)).toBe(true)
    expect(repo.countUnsyncedRows()).toBe(1)
    expect(unsyncedSignOutLine(repo.countUnsyncedRows())).toBe('1 entry has not synced.')
  })

  it('rejects a future date and still rejects a Free date older than 90 days', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    expect(() => commitEntry(repo, { ...emptyDraft('2026-10-20'), amount: '10', date: '2026-10-21' }, NOW)).toThrow(FUTURE_DATE_MESSAGE)
    expect(() => commitEntry(repo, { ...emptyDraft('2026-10-20'), amount: '10', date: '2026-07-21' }, NOW)).toThrow(OLDER_ENTRIES_LINE)
    commitEntry(repo, { ...emptyDraft('2026-10-20'), amount: '10', date: '2026-10-20' }, NOW)
    expect(repo.listLive('expenses', null)).toHaveLength(1)
  })

  it('blocks sign-out on the real unsynced count and can drop only those rows', () => {
    const { sqlite, repo } = openTestRepository({ now: () => NOW })
    repo.setSessionUserId(USER)
    const pending = repo.createExpense({ userId: USER, category: 'Groceries', type: 'needs', amount: 10, date: '2026-10-20' })
    const saved = repo.createExpense({ userId: USER, category: 'Dining Out', type: 'wants', amount: 20, date: '2026-10-20' })
    sqlite.prepare('update expenses set dirty = 0 where id = ?').run(saved.id)
    const removed = repo.createExpense({ userId: USER, category: 'Shopping', type: 'wants', amount: 5, date: '2026-10-19' })
    repo.softDeleteExpense(removed.id)
    expect(repo.countUnsyncedRows()).toBe(2)
    expect(unsyncedSignOutLine(2)).toBe('2 entries have not synced.')
    expect(repo.discardUnsyncedRows()).toBe(2)
    expect(repo.getRow('expenses', pending.id)).toBeNull()
    expect(repo.getRow('expenses', removed.id)).toBeNull()
    expect(repo.getRow('expenses', saved.id)?.dirty).toBe(false)
    expect(repo.countUnsyncedRows()).toBe(0)
    expect(unsyncedSignOutLine(1)).toBe('1 entry has not synced.')
  })
})

describe('account flow for the settings sheet', () => {
  it('does not adopt or require sync when the engine blocks goals', async () => {
    const { repo } = openTestRepository({ now: () => NOW })
    repo.createGoal({ userId: null, name: 'Phone', targetAmount: 10 })
    const tokens = new MemoryTokenStore()
    const adopt = vi.fn(async () => ({ entries: 0, goals: 0 }))
    const sync = vi.fn(async () => ({ pulled: 0, pushed: 0, errors: [], summary: [] }))
    const message = 'Free allows 2 goals; you have 1 here and 2 in your account. Remove some to continue.'
    const result = await signInAndAdopt({
      local: repo,
      tokens,
      userId: USER,
      tokenKey: 'sb-test-auth-token',
      tokenValue: 'token',
      syncEnabled: false,
      engine: {
        preview: async () => ({ local: emptyCounts(), server: emptyCounts(), goalLimitMessage: message }),
        adopt,
        sync,
      },
    })
    expect(result.goalLimitMessage).toBe(message)
    expect(adopt).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
    expect(repo.sessionUserId()).toBe(USER)
    expect(repo.listLive('goals', null)).toHaveLength(1)
  })

  it('adopts and syncs when the plan allows it', async () => {
    const { repo } = openTestRepository({ now: () => NOW })
    const tokens = new MemoryTokenStore()
    const adopt = vi.fn(async () => repo.adoptUnassigned(USER))
    const sync = vi.fn(async () => ({ pulled: 1, pushed: 1, errors: [], summary: ['1 budget kept from your account'] }))
    const result = await signInAndAdopt({
      local: repo,
      tokens,
      userId: USER,
      tokenKey: 'sb-test-auth-token',
      tokenValue: 'token',
      syncEnabled: true,
      engine: {
        preview: async () => ({ local: emptyCounts(), server: emptyCounts(), goalLimitMessage: null }),
        adopt,
        sync,
      },
    })
    expect(adopt).toHaveBeenCalledWith(USER)
    expect(sync).toHaveBeenCalledWith(USER)
    expect(result.report?.summary).toEqual(['1 budget kept from your account'])
  })

  it('says what moved onto the account, then which budgets stayed', async () => {
    const { repo } = openTestRepository({ now: () => NOW })
    repo.createExpense({ userId: null, category: 'Groceries', type: 'needs', amount: 10, date: '2026-10-20' })
    repo.createIncome({ userId: null, totalAmount: 20, date: '2026-10-20', incomeSource: 'Salary' })
    repo.createGoal({ userId: null, name: 'Phone', targetAmount: 10 })
    const tokens = new MemoryTokenStore()
    const result = await signInAndAdopt({
      local: repo,
      tokens,
      userId: USER,
      tokenKey: 'sb-test-auth-token',
      tokenValue: 'token',
      syncEnabled: true,
      engine: {
        preview: async () => ({ local: emptyCounts(), server: emptyCounts(), goalLimitMessage: null }),
        adopt: async () => repo.adoptUnassigned(USER),
        sync: async () => ({ pulled: 1, pushed: 1, errors: [], summary: ['1 budget kept from your account'] }),
      },
    })
    expect(result.report?.summary).toEqual([
      'Moved 2 entries and 1 goal to your account.',
      '1 budget kept from your account',
    ])
  })

  it('keeps the intro flag after sign-out clears local rows', async () => {
    const { sqlite, repo } = openTestRepository({ now: () => NOW })
    const prefs = prefsFor(sqlite)
    prefs.setFirstRunDone(true)
    prefs.setSyncEnabled(false)
    repo.createExpense({ userId: null, category: 'Groceries', type: 'needs', amount: 10, date: '2026-10-20' })
    await signOutKeepingIntro({
      local: repo,
      tokens: new MemoryTokenStore(),
      restoreIntro: true,
      markIntroDone: () => prefs.setFirstRunDone(true),
    })
    expect(repo.listLive('expenses', null)).toHaveLength(0)
    expect(prefs.firstRunDone()).toBe(true)
    expect(prefs.syncEnabled()).toBe(true)
    prefs.setLastCategory('expense', 'Dining Out')
    commitPeriodBudget(prefs, '2026-10-15', '900')
    const kept = prefs.exportKeptPrefs()
    await signOutKeepingIntro({
      local: repo,
      tokens: new MemoryTokenStore(),
      restoreIntro: true,
      markIntroDone: () => prefs.setFirstRunDone(true),
    })
    prefs.restoreKeptPrefs(kept)
    expect(prefs.lastCategory('expense')).toBe('Dining Out')
    expect(prefs.periodBudget('2026-10-15')).toBe(900)
    expect(prefs.syncEnabled()).toBe(true)
  })
})

describe('publishable config', () => {
  it('reads only the public Expo keys that are already in the environment', () => {
    expect(readPublicSupabaseConfig({})).toBeNull()
    expect(readPublicSupabaseConfig({
      EXPO_PUBLIC_SUPABASE_URL: ' https://example.supabase.co ',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ' anon ',
    })).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon' })
    expect(supabaseAuthStorageKey('https://abcd.supabase.co')).toBe('sb-abcd-auth-token')
  })
})
