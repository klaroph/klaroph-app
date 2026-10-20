import { describe, expect, it } from 'vitest'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '../domain/budgetLock'
import { GOAL_GRACE_BLOCK_MESSAGE } from '../domain/planLimits'
import { freeHistoryCutoffDate, HISTORY_LOCKED_MESSAGE } from '../domain/historyLock'
import { DomainError } from '../domain/errors'
import { openTestRepository } from '../db/testDb'
import type { KlaroRepository } from '../db/repository'
import { SyncEngine } from './engine'
import type { PullPageInput } from './cursor'
import type { ServerStamp, SyncedTable } from './model'
import type { AccountFeatures, PushMode, RemoteSync } from './remote'
import { activateAccount, signOut } from './session'
import { MemoryTokenStore } from './tokenStore'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
/** On or after the Manila cutoff, so a Free sync still allows edits. */
const INSIDE_HISTORY = freeHistoryCutoffDate()
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type Stored = {
  table: SyncedTable
  id: string
  user_id: string
  updated_at: string
  deleted_at: string | null
  raw: Record<string, unknown>
  hidden: boolean
}

class FakeRemote implements RemoteSync {
  readonly payloads: Array<{ table: SyncedTable; payload: Record<string, unknown> }> = []
  clearedDeletedAt = 0
  savedAmountSends = 0
  updatedAtSends = 0
  failNext = false
  pulls = 0
  goalCap = Number.POSITIVE_INFINITY
  resolveCalls = 0
  resolveError: Error | null = null
  account: AccountFeatures = {
    plan: { name: 'Free', maxGoals: 2 },
    fullBudgeting: false,
    accountCreatedAt: new Date().toISOString(),
    simulateBudgetExpired: false,
  }
  readonly modes: Array<{ table: SyncedTable; mode: PushMode; id: string }> = []
  readonly limits: number[] = []
  /** Runs after the server accepts the payload and before the stamp is returned. */
  onAccepted?: (table: SyncedTable, payload: Record<string, unknown>) => void
  private readonly rows = new Map<string, Stored>()
  private serverMs = Date.parse('2026-10-19T00:00:00.000Z')

  private key(table: SyncedTable, id: string): string {
    return `${table}:${id}`
  }

  private stamp(): string {
    const value = new Date(this.serverMs).toISOString()
    this.serverMs += 1000
    return value
  }

  insert(table: SyncedTable, raw: Record<string, unknown>, hidden = false): void {
    const id = String(raw.id)
    const updatedAt = String(raw.updated_at)
    this.rows.set(this.key(table, id), {
      table,
      id,
      user_id: String(raw.user_id),
      updated_at: updatedAt,
      deleted_at: raw.deleted_at == null ? null : String(raw.deleted_at),
      raw: { ...raw },
      hidden,
    })
  }

  reveal(table: SyncedTable, id: string): void {
    const row = this.rows.get(this.key(table, id))
    if (row) row.hidden = false
  }

  edit(table: SyncedTable, id: string, fields: Record<string, unknown>): void {
    const row = this.rows.get(this.key(table, id))
    if (!row) throw new Error('missing row')
    const updatedAt = this.stamp()
    Object.assign(row.raw, fields, { updated_at: updatedAt })
    row.updated_at = updatedAt
  }

  tombstone(table: SyncedTable, id: string): void {
    const row = this.rows.get(this.key(table, id))
    if (!row) throw new Error('missing row')
    const updatedAt = this.stamp()
    row.raw.deleted_at = updatedAt
    row.raw.updated_at = updatedAt
    row.deleted_at = updatedAt
    row.updated_at = updatedAt
  }

  get(table: SyncedTable, id: string): Record<string, unknown> | undefined {
    const row = this.rows.get(this.key(table, id))
    return row ? { ...row.raw } : undefined
  }

  async pullPage(input: PullPageInput): Promise<Record<string, unknown>[]> {
    this.pulls += 1
    this.limits.push(input.limit)
    const matched = [...this.rows.values()]
      .filter((row) => row.table === input.table && !row.hidden && row.user_id === input.userId)
      .filter((row) => input.updatedAtGte == null || Date.parse(row.updated_at) >= Date.parse(input.updatedAtGte))
      .filter((row) => {
        if (!input.after) return true
        const delta = Date.parse(row.updated_at) - Date.parse(input.after.updatedAt)
        if (delta > 0) return true
        if (delta < 0) return false
        return row.id > input.after.id
      })
      .sort((a, b) => {
        const delta = Date.parse(a.updated_at) - Date.parse(b.updated_at)
        if (delta !== 0) return delta
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })
    return matched.slice(0, input.limit).map((row) => ({ ...row.raw }))
  }

  async push(table: SyncedTable, payload: Record<string, unknown>, mode: PushMode): Promise<ServerStamp> {
    this.payloads.push({ table, payload: { ...payload } })
    this.modes.push({ table, mode, id: String(payload.id) })
    if ('deleted_at' in payload && payload.deleted_at == null) this.clearedDeletedAt += 1
    if ('saved_amount' in payload) this.savedAmountSends += 1
    if ('updated_at' in payload) this.updatedAtSends += 1
    const id = String(payload.id)
    const lockKey = `${table}:${id}`
    if (this.lockedIds.has(lockKey)) {
      throw new DomainError('HISTORY_LOCKED', 'HISTORY_LOCKED: entries older than 90 days are read-only on the Free plan')
    }
    if (this.missingIds.has(lockKey)) {
      throw new DomainError('PGRST116', 'Cannot coerce the result to a single JSON object')
    }
    const existing = this.rows.get(this.key(table, id))
    if (mode === 'insert' && !existing && table === 'goals' && payload.deleted_at == null) {
      const live = await this.countLive('goals', String(payload.user_id))
      if (live >= this.goalCap) throw new DomainError('GOAL_LIMIT_REACHED', 'goal limit')
    }
    this.assertLiveUnique(table, payload, existing ?? null)
    const updatedAt = this.stamp()
    let deletedAt: string | null = null
    if (existing?.deleted_at) deletedAt = existing.deleted_at
    else if (typeof payload.deleted_at === 'string') deletedAt = updatedAt
    const raw: Record<string, unknown> = {
      ...existing?.raw,
      ...payload,
      id,
      updated_at: updatedAt,
      deleted_at: deletedAt,
    }
    if (table === 'goals' && raw.saved_amount == null) raw.saved_amount = 0
    this.rows.set(this.key(table, id), {
      table,
      id,
      user_id: String(payload.user_id),
      updated_at: updatedAt,
      deleted_at: deletedAt,
      raw,
      hidden: false,
    })
    this.onAccepted?.(table, payload)
    if (this.failNext) {
      this.failNext = false
      throw new Error('response lost')
    }
    return { id, updated_at: updatedAt, deleted_at: deletedAt }
  }

  readonly lockedIds = new Set<string>()
  readonly missingIds = new Set<string>()

  hide(table: SyncedTable, id: string): void {
    const row = this.rows.get(this.key(table, id))
    if (row) row.hidden = true
  }

  async countLive(table: SyncedTable, userId: string): Promise<number> {
    // Hidden rows model the free 90-day SELECT policy. They are still stored.
    // A lower count is not a delete.
    return [...this.rows.values()].filter((row) => (
      row.table === table && row.user_id === userId && row.deleted_at == null && !row.hidden
    )).length
  }

  async resolveAccount(): Promise<AccountFeatures> {
    this.resolveCalls += 1
    if (this.resolveError) throw this.resolveError
    return this.account
  }

  private assertLiveUnique(table: SyncedTable, payload: Record<string, unknown>, existing: Stored | null): void {
    const deleted = existing?.deleted_at != null || typeof payload.deleted_at === 'string'
    if (deleted) return
    const category = payload.category
    const month = payload.month
    const userId = String(payload.user_id)
    const id = String(payload.id)
    const clash = [...this.rows.values()].find((row) => {
      if (row.table !== table || row.id === id || row.deleted_at || row.user_id !== userId) return false
      if (table === 'budget_plans') return row.raw.category === category
      if (table === 'budget_overrides') return row.raw.category === category && row.raw.month === month
      return false
    })
    if (clash) throw new DomainError('23505', 'duplicate key value violates unique constraint')
  }
}

function harness(options?: { overlapMs?: number; pageSize?: number }) {
  let sequence = 0
  const { repo } = openTestRepository({
    createId: () => {
      sequence += 1
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
    },
  })
  const remote = new FakeRemote()
  const engine = new SyncEngine(repo, remote, options)
  const tokens = new MemoryTokenStore()
  return { repo, remote, engine, tokens }
}

async function signIn(repo: KlaroRepository, tokens: MemoryTokenStore, userId: string, token: string) {
  return activateAccount({
    local: repo,
    tokens,
    userId,
    tokenKey: 'sb-klaro-auth-token',
    tokenValue: token,
  })
}

describe('sync engine', () => {
  it('previews local and server counts without uploading or deduping', async () => {
    const { repo, remote, engine } = harness()
    const local = repo.createExpense({
      userId: null,
      category: 'Groceries',
      type: 'needs',
      amount: 50,
      date: INSIDE_HISTORY,
    })
    remote.insert('expenses', {
      id: 'server-expense',
      user_id: USER_A,
      category: 'Rent',
      type: 'needs',
      amount: 100,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
      deleted_at: null,
    })
    const preview = await engine.preview(USER_A)
    expect(preview.local.expenses).toBe(1)
    expect(preview.server.expenses).toBe(1)
    expect(remote.payloads).toHaveLength(0)
    expect(repo.getRow('expenses', local.id)?.user_id).toBeNull()

    await engine.adopt(USER_A)
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(await remote.countLive('expenses', USER_A)).toBe(2)
    expect(repo.listLive('expenses', USER_A)).toHaveLength(2)
  })

  it('does not send saved_amount, updated_at, or a cleared deleted_at', async () => {
    const { repo, remote, engine } = harness()
    repo.createGoal({ userId: USER_A, name: 'Emergency', targetAmount: 1000 })
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    const payload = remote.payloads.find((entry) => entry.table === 'goals')?.payload
    expect(payload).not.toHaveProperty('saved_amount')
    expect(payload).not.toHaveProperty('updated_at')
    expect(payload).not.toHaveProperty('deleted_at')
    expect(remote.savedAmountSends).toBe(0)
    expect(remote.updatedAtSends).toBe(0)
    expect(remote.clearedDeletedAt).toBe(0)
  })

  it('retries a lost push response without creating a second row', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    remote.failNext = true
    const failed = await engine.sync(USER_A)
    expect(failed.errors.map((error) => error.message)).toContain('response lost')
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(true)
    expect(await remote.countLive('expenses', USER_A)).toBe(1)

    const retried = await engine.sync(USER_A)
    expect(retried.errors).toEqual([])
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    expect(await remote.countLive('expenses', USER_A)).toBe(1)
    expect(remote.payloads.filter((entry) => entry.payload.id === expense.id)).toHaveLength(2)
  })

  it('lets a remote tombstone win over a pending local edit', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    await engine.sync(USER_A)
    repo.updateExpense(expense.id, { amount: 99 })
    remote.tombstone('expenses', expense.id)
    const before = remote.payloads.length
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(repo.getRow('expenses', expense.id)?.deleted_at).not.toBeNull()
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    const later = remote.payloads.slice(before)
    expect(later.some((entry) => entry.payload.amount === 99)).toBe(false)
  })

  it('lets a local tombstone win over a newer remote edit', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    await engine.sync(USER_A)
    remote.edit('expenses', expense.id, { amount: 80 })
    repo.softDeleteExpense(expense.id)
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(remote.get('expenses', expense.id)?.deleted_at).toEqual(expect.any(String))
    expect(remote.payloads.some((entry) => entry.payload.id === expense.id && entry.payload.deleted_at == null && 'deleted_at' in entry.payload)).toBe(false)
    expect(remote.payloads.some((entry) => entry.payload.id === expense.id && typeof entry.payload.deleted_at === 'string')).toBe(true)
    expect(remote.clearedDeletedAt).toBe(0)
  })

  it('keeps a pending edit when the pulled row is the same server version, and applies a newer server write', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    await engine.sync(USER_A)
    repo.updateExpense(expense.id, { amount: 30 })
    await engine.sync(USER_A)
    expect(remote.get('expenses', expense.id)?.amount).toBe(30)
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('30.00')

    repo.updateExpense(expense.id, { amount: 40 })
    remote.edit('expenses', expense.id, { amount: 80 })
    await engine.sync(USER_A)
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('80.00')
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
  })

  it('pulls a row committed late when its timestamp falls inside the overlap window', async () => {
    const { repo, remote, engine } = harness({ overlapMs: 60_000 })
    remote.insert('expenses', {
      id: 'late-row',
      user_id: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-10-19T00:00:00.000Z',
      updated_at: '2026-10-19T00:00:00.000Z',
      deleted_at: null,
    }, true)
    remote.insert('expenses', {
      id: 'visible-row',
      user_id: USER_A,
      category: 'Rent',
      type: 'needs',
      amount: 100,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-10-19T00:00:10.000Z',
      updated_at: '2026-10-19T00:00:10.000Z',
      deleted_at: null,
    })
    await engine.sync(USER_A)
    expect(repo.getRow('expenses', 'visible-row')).not.toBeNull()
    expect(repo.getRow('expenses', 'late-row')).toBeNull()
    expect(repo.getCursor(USER_A, 'expenses')).toBe('2026-10-19T00:00:10.000Z')

    remote.reveal('expenses', 'late-row')
    await engine.sync(USER_A)
    expect(repo.getRow('expenses', 'late-row')?.values.category).toBe('Fare')
    expect(repo.listLive('expenses', USER_A)).toHaveLength(2)
  })

  it('does not see that late row when the overlap is zero', async () => {
    const { repo, remote, engine } = harness({ overlapMs: 0 })
    remote.insert('expenses', {
      id: 'late-row',
      user_id: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-10-19T00:00:00.000Z',
      updated_at: '2026-10-19T00:00:00.000Z',
      deleted_at: null,
    }, true)
    remote.insert('expenses', {
      id: 'visible-row',
      user_id: USER_A,
      category: 'Rent',
      type: 'needs',
      amount: 100,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-10-19T00:00:10.000Z',
      updated_at: '2026-10-19T00:00:10.000Z',
      deleted_at: null,
    })
    await engine.sync(USER_A)
    remote.reveal('expenses', 'late-row')
    await engine.sync(USER_A)
    expect(repo.getRow('expenses', 'late-row')).toBeNull()
  })

  it('pages through rows that share an updated_at without duplicating them', async () => {
    const { repo, remote, engine } = harness({ pageSize: 1 })
    const stamp = '2026-10-19T00:00:00.000Z'
    remote.insert('expenses', {
      id: '00000000-0000-4000-8000-000000000002',
      user_id: USER_A,
      category: 'B',
      type: 'wants',
      amount: 2,
      date: INSIDE_HISTORY,
      description: null,
      created_at: stamp,
      updated_at: stamp,
      deleted_at: null,
    })
    remote.insert('expenses', {
      id: '00000000-0000-4000-8000-000000000001',
      user_id: USER_A,
      category: 'A',
      type: 'needs',
      amount: 1,
      date: INSIDE_HISTORY,
      description: null,
      created_at: stamp,
      updated_at: stamp,
      deleted_at: null,
    })
    await engine.sync(USER_A)
    expect(repo.listLive('expenses', USER_A).map((row) => row.values.category).sort()).toEqual(['A', 'B'])
    await engine.sync(USER_A)
    expect(repo.listLive('expenses', USER_A)).toHaveLength(2)
  })

  it('pushes a goal tombstone and the allocation tombstone, and skips a delete that never reached the server', async () => {
    const { repo, remote, engine } = harness()
    const goal = repo.createGoal({ userId: USER_A, name: 'Emergency', targetAmount: 500 })
    const deposit = repo.createDeposit({ userId: USER_A, goalId: goal.id, amount: 25 })
    await engine.sync(USER_A)
    repo.softDeleteGoal(goal.id)
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(remote.get('goals', goal.id)?.deleted_at).toEqual(expect.any(String))
    expect(remote.get('income_allocations', deposit.id)?.deleted_at).toEqual(expect.any(String))

    const fresh = repo.createExpense({
      userId: USER_A,
      category: 'Coffee',
      type: 'wants',
      amount: 5,
      date: INSIDE_HISTORY,
    })
    repo.softDeleteExpense(fresh.id)
    await engine.sync(USER_A)
    expect(remote.get('expenses', fresh.id)).toBeUndefined()
    expect(repo.getRow('expenses', fresh.id)).toBeNull()
  })

  it('keeps the account budget and drops the local clash', async () => {
    const { repo, remote, engine } = harness()
    const local = repo.createBudgetPlan({ userId: USER_A, category: 'Food', amount: 100 })
    remote.insert('budget_plans', {
      id: 'server-plan',
      user_id: USER_A,
      category: 'Food',
      amount: 200,
      note: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      deleted_at: null,
    })
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(report.summary).toEqual(['1 budget kept from your account'])
    expect(repo.getRow('budget_plans', 'server-plan')?.values.amount).toBe('200.00')
    expect(repo.listLive('budget_plans', USER_A).map((row) => row.id)).toEqual(['server-plan'])
    expect(remote.payloads.some((entry) => entry.payload.id === local.id)).toBe(false)
    expect(remote.get('budget_plans', 'server-plan')?.amount).toBe(200)
  })

  it('pluralizes the budget merge line when a plan and an override both clash', async () => {
    const { repo, remote, engine } = harness()
    repo.createBudgetPlan({ userId: USER_A, category: 'Food', amount: 100 })
    repo.saveBudgetOverride({ userId: USER_A, category: 'Food', amount: 40, month: '2026-01-15' })
    remote.insert('budget_plans', {
      id: 'server-plan',
      user_id: USER_A,
      category: 'Food',
      amount: 200,
      note: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      deleted_at: null,
    })
    remote.insert('budget_overrides', {
      id: 'server-override',
      user_id: USER_A,
      category: 'Food',
      amount: 80,
      month: '2026-01-01',
      note: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      deleted_at: null,
    })
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(report.summary).toEqual(['2 budgets kept from your account'])
    expect(repo.getRow('budget_plans', 'server-plan')?.values.amount).toBe('200.00')
    expect(repo.getRow('budget_overrides', 'server-override')?.values.amount).toBe('80.00')
    expect(repo.listLive('budget_plans', USER_A)).toHaveLength(1)
    expect(repo.listLive('budget_overrides', USER_A)).toHaveLength(1)
  })

  it('blocks adoption and sync when device goals plus account goals exceed the plan', async () => {
    const { repo, remote, engine } = harness()
    const first = repo.createGoal({ userId: null, name: 'Emergency', targetAmount: 100 })
    const second = repo.createGoal({ userId: null, name: 'Tuition', targetAmount: 200 })
    const expense = repo.createExpense({
      userId: null,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    const syncedExpense = repo.createExpense({
      userId: USER_A,
      category: 'Rent',
      type: 'needs',
      amount: 100,
      date: INSIDE_HISTORY,
    })
    remote.insert('goals', {
      id: 'server-goal',
      user_id: USER_A,
      name: 'Vacation',
      target_amount: 500,
      saved_amount: 0,
      pinned_at: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      deleted_at: null,
    })
    const blocked = 'Free allows 2 goals; you have 2 here and 1 in your account. Remove some to continue.'
    const preview = await engine.preview(USER_A)
    expect(preview.goalLimitMessage).toBe(blocked)
    expect(preview.local.goals).toBe(2)
    expect(preview.server.goals).toBe(1)
    await expect(engine.adopt(USER_A)).rejects.toMatchObject({ code: 'GOAL_LIMIT_REACHED', message: blocked })
    expect(repo.getRow('goals', first.id)?.user_id).toBeNull()
    expect(repo.getRow('goals', second.id)?.user_id).toBeNull()

    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([{ table: 'goals', message: blocked, code: 'GOAL_LIMIT_REACHED' }])
    expect(report.pulled).toBeGreaterThan(0)
    expect(remote.get('expenses', syncedExpense.id)?.category).toBe('Rent')
    expect(remote.get('goals', first.id)).toBeUndefined()
    expect(remote.get('goals', second.id)).toBeUndefined()
    expect(repo.getRow('expenses', expense.id)?.user_id).toBeNull()
    expect(await remote.countLive('goals', USER_A)).toBe(1)

    repo.softDeleteGoal(second.id)
    const open = await engine.preview(USER_A)
    expect(open.goalLimitMessage).toBeNull()
    await engine.adopt(USER_A)
    const synced = await engine.sync(USER_A)
    expect(synced.errors).toEqual([])
    expect(await remote.countLive('goals', USER_A)).toBe(2)
    expect(remote.get('goals', first.id)?.name).toBe('Emergency')
    expect(remote.get('goals', second.id)).toBeUndefined()
    expect(repo.getRow('goals', 'server-goal')?.values.name).toBe('Vacation')
  })

  it('uses the resolved plan cap and does not count goals that are already on the account', async () => {
    const { repo, remote, engine } = harness()
    repo.createGoal({ userId: USER_A, name: 'One', targetAmount: 10 })
    repo.createGoal({ userId: USER_A, name: 'Two', targetAmount: 10 })
    await engine.sync(USER_A)
    remote.insert('goals', {
      id: 'server-goal',
      user_id: USER_A,
      name: 'Three',
      target_amount: 10,
      saved_amount: 0,
      pinned_at: null,
      created_at: '2026-10-20T00:00:00.000Z',
      updated_at: '2026-10-20T00:00:00.000Z',
      deleted_at: null,
    })
    const underPro = await engine.preview(USER_A, { name: 'Pro', maxGoals: 20 })
    expect(underPro.goalLimitMessage).toBeNull()
    const overFree = await engine.preview(USER_A)
    expect(overFree.goalLimitMessage).toBe(
      'Free allows 2 goals; you have 0 here and 3 in your account. Remove some to continue.',
    )
    const again = await engine.sync(USER_A, { name: 'Pro', maxGoals: 20 })
    expect(again.errors).toEqual([])
    expect(repo.getRow('goals', 'server-goal')?.values.name).toBe('Three')
  })

  it('updates an acknowledged goal at the cap and inserts only rows the server has not seen', async () => {
    const { repo, remote, engine } = harness()
    remote.goalCap = 2
    const first = repo.createGoal({ userId: USER_A, name: 'Emergency', targetAmount: 100 })
    const second = repo.createGoal({ userId: USER_A, name: 'Tuition', targetAmount: 200 })
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    const created = await engine.sync(USER_A)
    expect(created.errors).toEqual([])
    expect(remote.modes.filter((entry) => entry.table === 'goals').map((entry) => entry.mode)).toEqual(['insert', 'insert'])
    expect(remote.modes.find((entry) => entry.id === expense.id)?.mode).toBe('insert')

    remote.modes.length = 0
    repo.updateGoal(first.id, { name: 'Renamed' })
    repo.updateExpense(expense.id, { amount: 30 })
    const edited = await engine.sync(USER_A)
    expect(edited.errors).toEqual([])
    expect(remote.modes.every((entry) => entry.mode === 'update')).toBe(true)
    expect(remote.get('goals', first.id)?.name).toBe('Renamed')
    expect(remote.get('expenses', expense.id)?.amount).toBe(30)

    remote.modes.length = 0
    repo.softDeleteGoal(second.id)
    const removed = await engine.sync(USER_A)
    expect(removed.errors).toEqual([])
    expect(remote.modes.find((entry) => entry.id === second.id)?.mode).toBe('update')
    expect(remote.get('goals', second.id)?.deleted_at).toEqual(expect.any(String))
  })

  it('uploads a replacement goal after its delete and still syncs other tables when new goals do not fit', async () => {
    const { repo, remote, engine } = harness()
    remote.goalCap = 2
    const first = repo.createGoal({ userId: USER_A, name: 'Emergency', targetAmount: 100 })
    const second = repo.createGoal({ userId: USER_A, name: 'Tuition', targetAmount: 200 })
    await engine.sync(USER_A)

    repo.softDeleteGoal(first.id)
    const third = repo.createGoal({ userId: USER_A, name: 'Scooter', targetAmount: 50, maxGoals: 20 })
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    remote.modes.length = 0
    const replaced = await engine.sync(USER_A)
    expect(replaced.errors).toEqual([])
    const goalModes = remote.modes.filter((entry) => entry.table === 'goals')
    expect(goalModes[0]).toMatchObject({ id: first.id, mode: 'update' })
    expect(goalModes.some((entry) => entry.id === third.id && entry.mode === 'insert')).toBe(true)
    expect(goalModes.findIndex((entry) => entry.id === first.id)).toBeLessThan(
      goalModes.findIndex((entry) => entry.id === third.id),
    )
    expect(await remote.countLive('goals', USER_A)).toBe(2)
    expect(remote.get('expenses', expense.id)?.category).toBe('Fare')

    const extra = repo.createGoal({ userId: USER_A, name: 'Laptop', targetAmount: 80, maxGoals: 20 })
    const fare = repo.createExpense({
      userId: USER_A,
      category: 'Snack',
      type: 'wants',
      amount: 5,
      date: INSIDE_HISTORY,
    })
    const blocked = await engine.sync(USER_A)
    expect(blocked.errors.map((error) => error.code)).toContain('GOAL_LIMIT_REACHED')
    expect(remote.get('expenses', fare.id)?.category).toBe('Snack')
    expect(remote.get('goals', extra.id)).toBeUndefined()
    expect(repo.getRow('goals', extra.id)?.dirty).toBe(true)
    expect(await remote.countLive('goals', USER_A)).toBe(2)
  })

  it('keeps an edit made while its push is in flight', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    await engine.sync(USER_A)
    repo.updateExpense(expense.id, { amount: 50 })
    remote.onAccepted = () => {
      remote.onAccepted = undefined
      repo.updateExpense(expense.id, { amount: 77 })
    }
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(remote.get('expenses', expense.id)?.amount).toBe(50)
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('77.00')
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(true)
  })

  it('asks for at most 1000 rows per page and continues after a full page', async () => {
    const { repo, remote, engine } = harness({ pageSize: 5000 })
    const stamp = '2026-10-19T00:00:00.000Z'
    for (let index = 0; index < 1001; index += 1) {
      remote.insert('expenses', {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        user_id: USER_A,
        category: 'Fare',
        type: 'needs',
        amount: 1,
        date: INSIDE_HISTORY,
        description: null,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      })
    }
    await engine.sync(USER_A)
    expect(remote.limits.every((limit) => limit <= 1000)).toBe(true)
    expect(remote.limits).toContain(1000)
    expect(repo.listLive('expenses', USER_A)).toHaveLength(1001)
  })

  it('does not call a server replace of a synced budget a clash', async () => {
    const { repo, remote, engine } = harness()
    const local = repo.createBudgetPlan({ userId: USER_A, category: 'Food', amount: 100 })
    await engine.sync(USER_A)
    remote.insert('budget_plans', {
      id: 'replacement-plan',
      user_id: USER_A,
      category: 'Food',
      amount: 250,
      note: null,
      created_at: '2026-10-20T00:00:00.000Z',
      updated_at: '2026-10-20T00:00:00.000Z',
      deleted_at: null,
    })
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(report.summary).toEqual([])
    expect(repo.getRow('budget_plans', 'replacement-plan')?.values.amount).toBe('250.00')
    expect(repo.listLive('budget_plans', USER_A).map((row) => row.id)).toEqual(['replacement-plan'])
    expect(repo.getRow('budget_plans', local.id)?.deleted_at).not.toBeNull()
  })

  it('clears rows, cursors, and the token on sign-out', async () => {
    const { repo, remote, engine, tokens } = harness()
    repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    await signIn(repo, tokens, USER_A, 'token-a')
    await engine.sync(USER_A)
    expect(repo.getCursor(USER_A, 'expenses')).not.toBeNull()
    await signOut({ local: repo, tokens })
    expect(await tokens.get('sb-klaro-auth-token')).toBeNull()
    expect(repo.sessionUserId()).toBeNull()
    expect(repo.listLive('expenses', USER_A)).toHaveLength(0)
    expect(repo.getCursor(USER_A, 'expenses')).toBeNull()
    expect(await remote.countLive('expenses', USER_A)).toBe(1)
  })

  it('keeps local-only data on the first sign-in and isolates a different account', async () => {
    const { repo, tokens } = harness()
    const local = repo.createExpense({
      userId: null,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: INSIDE_HISTORY,
    })
    const first = await signIn(repo, tokens, USER_A, 'token-a')
    expect(first.isolated).toBe(false)
    expect(repo.getRow('expenses', local.id)).not.toBeNull()
    expect(await tokens.get('sb-klaro-auth-token')).toBe('token-a')

    repo.adoptUnassigned(USER_A)
    const second = await signIn(repo, tokens, USER_B, 'token-b')
    expect(second.isolated).toBe(true)
    expect(repo.getRow('expenses', local.id)).toBeNull()
    expect(repo.listLive('expenses', USER_A)).toHaveLength(0)
    expect(repo.sessionUserId()).toBe(USER_B)
    expect(await tokens.get('sb-klaro-auth-token')).toBe('token-b')
  })

  it('uses the goal cap from the account subscription when sync is not given a plan', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    repo.createGoal({ userId: USER_A, name: 'One', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: USER_A, name: 'Two', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: USER_A, name: 'Three', targetAmount: 10, maxGoals: 20 })
    const report = await engine.sync(USER_A)
    expect(remote.resolveCalls).toBe(1)
    expect(report.errors).toEqual([])
    expect(remote.modes.filter((entry) => entry.table === 'goals' && entry.mode === 'insert')).toHaveLength(3)
    expect(await remote.countLive('goals', USER_A)).toBe(3)
  })

  it('keeps the free cap and still syncs other tables when the plan lookup fails', async () => {
    const { repo, remote, engine } = harness()
    remote.resolveError = new DomainError('42501', 'permission denied for table subscriptions')
    repo.createGoal({ userId: USER_A, name: 'One', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: USER_A, name: 'Two', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: USER_A, name: 'Three', targetAmount: 10, maxGoals: 20 })
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    const report = await engine.sync(USER_A)
    expect(report.errors.map((error) => error.code)).toEqual(['42501', 'GOAL_LIMIT_REACHED'])
    expect(remote.get('expenses', expense.id)?.category).toBe('Fare')
    expect(await remote.countLive('goals', USER_A)).toBe(0)
    expect(repo.budgetEditingAllowed()).toBe(true)
    expect(() => repo.createBudgetPlan({ userId: USER_A, category: 'Food', amount: 10 })).not.toThrow()
  })

  it('still uploads goals under an explicit plan when the lookup fails', async () => {
    const { repo, remote, engine } = harness()
    remote.resolveError = new DomainError('42501', 'permission denied for table subscriptions')
    repo.createGoal({ userId: USER_A, name: 'One', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: USER_A, name: 'Two', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: USER_A, name: 'Three', targetAmount: 10, maxGoals: 20 })
    const report = await engine.sync(USER_A, { name: 'Pro', maxGoals: 20 })
    expect(report.errors).toEqual([{
      table: 'goals',
      message: 'permission denied for table subscriptions',
      code: '42501',
    }])
    expect(await remote.countLive('goals', USER_A)).toBe(3)
  })

  it('holds signed-in free budget edits after the trial and still syncs other tables', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const first = repo.createBudgetPlan({ userId: USER_A, category: 'Food', amount: 100 })
    repo.replaceBudgetPlans(USER_A, [{ category: 'Food', amount: 80 }])
    repo.saveBudgetOverride({ userId: USER_A, category: 'Food', amount: 10, month: '2026-02-01' })
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([{
      table: 'budget_plans',
      message: BUDGET_LOCK_UPGRADE_MESSAGE,
      code: 'BUDGET_LOCKED',
    }])
    expect(remote.payloads.filter((entry) => entry.table === 'budget_plans' || entry.table === 'budget_overrides')).toHaveLength(0)
    expect(remote.get('expenses', expense.id)?.category).toBe('Fare')
    expect(repo.getRow('budget_plans', first.id)).toBeNull()
    expect(repo.listLive('budget_plans', USER_A)[0]?.dirty).toBe(true)
    expect(repo.listLive('budget_overrides', USER_A)[0]?.dirty).toBe(true)
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    expect(() => repo.createBudgetPlan({ userId: USER_A, category: 'Rent', amount: 10 })).toThrow(
      expect.objectContaining({ code: 'BUDGET_LOCKED', message: BUDGET_LOCK_UPGRADE_MESSAGE }),
    )
  })

  it('pushes budget edits when the account has full budgeting', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: true,
    }
    const plan = repo.createBudgetPlan({ userId: USER_A, category: 'Food', amount: 100 })
    const report = await engine.sync(USER_A)
    expect(report.errors).toEqual([])
    expect(remote.get('budget_plans', plan.id)?.category).toBe('Food')
    expect(repo.getRow('budget_plans', plan.id)?.dirty).toBe(false)
  })

  it('blocks new goals during past-due grace, keeps edits and deletes syncing, and does not retry the create', async () => {
    const { repo, remote, engine } = harness()
    const grace = {
      plan: { name: 'Pro', maxGoals: 0, blocksNewGoals: true },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const existing = repo.createGoal({ userId: USER_A, name: 'Emergency', targetAmount: 10, maxGoals: 20 })
    await engine.sync(USER_A)

    remote.account = grace
    const created = repo.createGoal({ userId: USER_A, name: 'Trip', targetAmount: 10, maxGoals: 20 })
    repo.updateGoal(existing.id, { name: 'Emergency fund' })
    const blocked = await engine.sync(USER_A)
    expect(blocked.errors).toEqual([{
      table: 'goals',
      message: GOAL_GRACE_BLOCK_MESSAGE,
      code: 'GOAL_CREATION_GRACE',
    }])
    expect(remote.get('goals', created.id)).toBeUndefined()
    expect(repo.getRow('goals', created.id)?.dirty).toBe(false)
    expect(repo.getRow('goals', created.id)?.base_updated_at).toBeNull()
    expect(remote.get('goals', existing.id)?.name).toBe('Emergency fund')
    expect(remote.modes.filter((entry) => entry.id === existing.id).at(-1)?.mode).toBe('update')

    const pushesAfterBlock = remote.payloads.length
    const again = await engine.sync(USER_A)
    expect(again.errors).toEqual([{
      table: 'goals',
      message: GOAL_GRACE_BLOCK_MESSAGE,
      code: 'GOAL_CREATION_GRACE',
    }])
    expect(remote.payloads.length).toBe(pushesAfterBlock)
    expect(remote.modes.filter((entry) => entry.id === created.id)).toHaveLength(0)

    repo.softDeleteGoal(existing.id)
    const removed = await engine.sync(USER_A)
    expect(removed.errors.map((error) => error.code)).toEqual(['GOAL_CREATION_GRACE'])
    expect(remote.get('goals', existing.id)?.deleted_at).toEqual(expect.any(String))
    expect(remote.modes.filter((entry) => entry.id === existing.id).at(-1)?.mode).toBe('update')
    expect(remote.get('goals', created.id)).toBeUndefined()

    expect(() => repo.createGoal({ userId: USER_A, name: 'Another', targetAmount: 5, maxGoals: 20 })).toThrow(
      expect.objectContaining({ code: 'GOAL_CREATION_GRACE', message: GOAL_GRACE_BLOCK_MESSAGE }),
    )
    expect(repo.createGoal({ userId: null, name: 'Local', targetAmount: 5 }).user_id).toBeNull()

    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const resumed = await engine.sync(USER_A)
    expect(resumed.errors).toEqual([])
    expect(remote.get('goals', created.id)?.name).toBe('Trip')
    expect(remote.modes.filter((entry) => entry.id === created.id && entry.mode === 'insert')).toHaveLength(1)
  })

  it('refuses keep-both while a new local goal is waiting out past-due grace', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 0, blocksNewGoals: true },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const goal = repo.createGoal({ userId: null, name: 'Trip', targetAmount: 10 })
    const expense = repo.createExpense({
      userId: null,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    const preview = await engine.preview(USER_A)
    expect(preview.goalLimitMessage).toBe(GOAL_GRACE_BLOCK_MESSAGE)
    await expect(engine.adopt(USER_A)).rejects.toMatchObject({
      code: 'GOAL_CREATION_GRACE',
      message: GOAL_GRACE_BLOCK_MESSAGE,
    })
    expect(repo.getRow('goals', goal.id)?.user_id).toBeNull()
    expect(repo.getRow('expenses', expense.id)?.user_id).toBeNull()
  })

  it('holds a deposit with its unsynced goal and uploads the deposit after the goal', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 0, blocksNewGoals: true },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const goal = repo.createGoal({ userId: USER_A, name: 'Trip', targetAmount: 100, maxGoals: 20 })
    const deposit = repo.createDeposit({ userId: USER_A, goalId: goal.id, amount: 25 })
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    remote.insert('expenses', {
      id: 'late-expense',
      user_id: USER_A,
      category: 'Late',
      type: 'needs',
      amount: 1,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-10-19T00:00:00.000Z',
      updated_at: '2026-10-21T00:00:00.000Z',
      deleted_at: null,
    }, true)
    remote.onAccepted = (table) => {
      if (table !== 'expenses') return
      remote.onAccepted = undefined
      remote.reveal('expenses', 'late-expense')
    }
    const blocked = await engine.sync(USER_A)
    expect(blocked.errors).toEqual([{
      table: 'goals',
      message: GOAL_GRACE_BLOCK_MESSAGE,
      code: 'GOAL_CREATION_GRACE',
    }])
    expect(remote.modes.filter((entry) => entry.id === deposit.id)).toHaveLength(0)
    expect(remote.get('goals', goal.id)).toBeUndefined()
    expect(repo.getRow('goals', goal.id)?.dirty).toBe(false)
    expect(repo.getRow('income_allocations', deposit.id)?.dirty).toBe(false)
    expect(remote.get('expenses', expense.id)?.category).toBe('Fare')
    expect(repo.getRow('expenses', 'late-expense')?.values.category).toBe('Late')

    repo.updateDeposit(deposit.id, 30)
    const again = await engine.sync(USER_A)
    expect(again.errors.map((error) => error.code)).toEqual(['GOAL_CREATION_GRACE'])
    expect(remote.modes.filter((entry) => entry.id === deposit.id)).toHaveLength(0)
    expect(repo.getRow('income_allocations', deposit.id)?.dirty).toBe(false)
    expect(repo.getRow('income_allocations', deposit.id)?.values.amount).toBe('30.00')

    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const resumed = await engine.sync(USER_A)
    expect(resumed.errors).toEqual([])
    const goalPush = remote.modes.findIndex((entry) => entry.id === goal.id && entry.mode === 'insert')
    const depositPush = remote.modes.findIndex((entry) => entry.id === deposit.id && entry.mode === 'insert')
    expect(goalPush).toBeGreaterThanOrEqual(0)
    expect(depositPush).toBeGreaterThan(goalPush)
    expect(remote.get('income_allocations', deposit.id)?.amount).toBe(30)
    expect(repo.getRow('income_allocations', deposit.id)?.dirty).toBe(false)
  })

  it('keeps the last grace plan when the next plan read fails', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 0, blocksNewGoals: true },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const goal = repo.createGoal({ userId: USER_A, name: 'Trip', targetAmount: 100, maxGoals: 20 })
    const deposit = repo.createDeposit({ userId: USER_A, goalId: goal.id, amount: 25 })
    await engine.sync(USER_A)
    expect(repo.knownPlan()).toMatchObject({ name: 'Pro', maxGoals: 0, blocksNewGoals: true })

    remote.resolveError = new DomainError('42501', 'permission denied for table subscriptions')
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    remote.insert('expenses', {
      id: 'late-expense',
      user_id: USER_A,
      category: 'Late',
      type: 'needs',
      amount: 1,
      date: INSIDE_HISTORY,
      description: null,
      created_at: '2026-10-19T00:00:00.000Z',
      updated_at: '2026-10-21T00:00:00.000Z',
      deleted_at: null,
    }, true)
    remote.onAccepted = (table) => {
      if (table !== 'expenses') return
      remote.onAccepted = undefined
      remote.reveal('expenses', 'late-expense')
    }
    const report = await engine.sync(USER_A)
    expect(report.errors.map((error) => error.code)).toEqual(['42501', 'GOAL_CREATION_GRACE'])
    expect(remote.get('goals', goal.id)).toBeUndefined()
    expect(remote.modes.filter((entry) => entry.id === deposit.id)).toHaveLength(0)
    expect(repo.getRow('goals', goal.id)?.dirty).toBe(false)
    expect(repo.getRow('income_allocations', deposit.id)?.dirty).toBe(false)
    expect(repo.goalCreatesBlocked()).toBe(true)
    expect(remote.get('expenses', expense.id)?.category).toBe('Fare')
    expect(repo.getRow('expenses', 'late-expense')?.values.category).toBe('Late')
  })

  it('blocks edits of old rows after a Free sync and does not read a hidden count as a delete', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: '2020-01-01',
    })
    const income = repo.createIncome({
      userId: USER_A,
      totalAmount: 100,
      date: '2020-01-02',
    })
    const recent = repo.createExpense({
      userId: USER_A,
      category: 'Fare',
      type: 'needs',
      amount: 15,
      date: INSIDE_HISTORY,
    })
    await engine.sync(USER_A)
    expect(repo.freeHistoryCutoff()).toBe(freeHistoryCutoffDate())
    expect(repo.knownPlan()?.name).toBe('Free')
    remote.hide('expenses', expense.id)
    remote.hide('income_records', income.id)
    const hidden = await engine.sync(USER_A)
    expect(hidden.errors).toEqual([])
    expect(repo.getRow('expenses', expense.id)?.deleted_at).toBeNull()
    expect(repo.getRow('income_records', income.id)?.deleted_at).toBeNull()
    expect(repo.listLive('expenses', USER_A)).toHaveLength(2)
    expect(await remote.countLive('expenses', USER_A)).toBe(1)

    const attempts = remote.payloads.filter((entry) => entry.payload.id === expense.id).length
    expect(() => repo.updateExpense(expense.id, { amount: 99 })).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(() => repo.softDeleteExpense(expense.id)).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(() => repo.updateExpense(expense.id, { date: INSIDE_HISTORY })).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(() => repo.updateIncome(income.id, { totalAmount: 80 })).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(() => repo.softDeleteIncome(income.id)).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(() => repo.updateExpense(recent.id, { date: '2020-01-01' })).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('20.00')
    expect(repo.getRow('expenses', recent.id)?.dirty).toBe(false)
    expect(repo.getRow('expenses', recent.id)?.values.date).toBe(INSIDE_HISTORY)
    const again = await engine.sync(USER_A)
    expect(again.errors).toEqual([])
    expect(remote.payloads.filter((entry) => entry.payload.id === expense.id)).toHaveLength(attempts)
    expect(remote.get('expenses', expense.id)?.amount).toBe(20)
  })

  it('reverts phone 99 to the last synced 10 and does not upload it after Pro', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 10,
      date: '2020-01-01',
    })
    await engine.sync(USER_A)
    expect(remote.get('expenses', expense.id)?.amount).toBe(10)
    repo.updateExpense(expense.id, { amount: 99 })
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('99.00')
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(true)

    remote.account = {
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    remote.lockedIds.add(`expenses:${expense.id}`)
    const before = remote.payloads.length
    const refused = await engine.sync(USER_A)
    expect(refused.errors).toEqual([{
      table: 'expenses',
      id: expense.id,
      message: HISTORY_LOCKED_MESSAGE,
      code: 'HISTORY_LOCKED',
    }])
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('10.00')
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    expect(repo.getRow('expenses', expense.id)?.deleted_at).toBeNull()
    expect(remote.get('expenses', expense.id)?.amount).toBe(10)

    remote.lockedIds.clear()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const afterRefusal = remote.payloads.length
    const upgraded = await engine.sync(USER_A)
    expect(upgraded.errors).toEqual([])
    expect(remote.payloads.slice(afterRefusal).filter((entry) => entry.payload.id === expense.id)).toHaveLength(0)
    expect(remote.payloads.slice(before).some((entry) => entry.payload.amount === 99 && entry.payload.id === expense.id)).toBe(true)
    expect(remote.get('expenses', expense.id)?.amount).toBe(10)
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('10.00')
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
  })

  it('keeps income allocations when an old income delete is history-locked and uploads both on Pro', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const goal = repo.createGoal({ userId: USER_A, name: 'Emergency', targetAmount: 500 })
    const income = repo.createIncome({
      userId: USER_A,
      totalAmount: 100,
      date: '2020-01-01',
    })
    const deposit = repo.createDeposit({
      userId: USER_A,
      goalId: goal.id,
      amount: 25,
      incomeRecordId: income.id,
    })
    await engine.sync(USER_A)
    repo.softDeleteIncome(income.id)
    remote.account = {
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    remote.lockedIds.add(`income_records:${income.id}`)
    const before = remote.payloads.length
    const refused = await engine.sync(USER_A)
    expect(refused.errors.map((error) => error.code)).toEqual(['HISTORY_LOCKED'])
    expect(repo.getRow('income_records', income.id)?.deleted_at).toBeNull()
    expect(repo.getRow('income_allocations', deposit.id)?.deleted_at).toBeNull()
    expect(remote.get('income_records', income.id)?.deleted_at).toBeNull()
    expect(remote.get('income_allocations', deposit.id)?.deleted_at).toBeNull()
    expect(remote.payloads.slice(before).some((entry) => entry.table === 'income_allocations')).toBe(false)

    remote.lockedIds.clear()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    await engine.sync(USER_A)
    repo.softDeleteIncome(income.id)
    const removed = await engine.sync(USER_A)
    expect(removed.errors).toEqual([])
    expect(remote.get('income_records', income.id)?.deleted_at).toEqual(expect.any(String))
    expect(remote.get('income_allocations', deposit.id)?.deleted_at).toEqual(expect.any(String))
  })

  it('retries PGRST116 on a row inside the free window', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: freeHistoryCutoffDate(),
    })
    await engine.sync(USER_A)
    remote.missingIds.add(`expenses:${expense.id}`)
    repo.updateExpense(expense.id, { amount: 30 })
    const missing = await engine.sync(USER_A)
    expect(missing.errors.map((error) => error.code)).toEqual(['PGRST116'])
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(true)
    const attempts = remote.payloads.filter((entry) => entry.payload.id === expense.id).length
    await engine.sync(USER_A)
    expect(remote.payloads.filter((entry) => entry.payload.id === expense.id).length).toBeGreaterThan(attempts)
  })

  it('locks an old expense on HISTORY_LOCKED or PGRST116 and does not read a hidden count as a delete', async () => {
    const { repo, remote, engine } = harness()
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: '2020-01-01',
    })
    const income = repo.createIncome({
      userId: USER_A,
      totalAmount: 100,
      date: '2020-01-02',
    })
    await engine.sync(USER_A)
    remote.hide('expenses', expense.id)
    remote.hide('income_records', income.id)
    const hidden = await engine.sync(USER_A)
    expect(hidden.errors).toEqual([])
    expect(repo.getRow('expenses', expense.id)?.deleted_at).toBeNull()
    expect(repo.getRow('income_records', income.id)?.deleted_at).toBeNull()
    expect(repo.listLive('expenses', USER_A)).toHaveLength(1)
    expect(await remote.countLive('expenses', USER_A)).toBe(0)

    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    await engine.sync(USER_A)
    repo.updateExpense(expense.id, { amount: 30 })
    remote.account = {
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    remote.lockedIds.add(`expenses:${expense.id}`)
    const locked = await engine.sync(USER_A)
    expect(locked.errors).toEqual([{
      table: 'expenses',
      id: expense.id,
      message: HISTORY_LOCKED_MESSAGE,
      code: 'HISTORY_LOCKED',
    }])
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    expect(repo.getRow('expenses', expense.id)?.deleted_at).toBeNull()
    expect(repo.getRow('expenses', expense.id)?.values.amount).toBe('20.00')
    expect(remote.get('expenses', expense.id)?.amount).toBe(20)
    const attempts = remote.payloads.filter((entry) => entry.payload.id === expense.id).length
    const again = await engine.sync(USER_A)
    expect(again.errors).toEqual([])
    expect(remote.payloads.filter((entry) => entry.payload.id === expense.id)).toHaveLength(attempts)
    expect(() => repo.updateExpense(expense.id, { amount: 40 })).toThrow(HISTORY_LOCKED_MESSAGE)
    expect(() => repo.softDeleteExpense(expense.id)).toThrow(HISTORY_LOCKED_MESSAGE)

    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    await engine.sync(USER_A)
    repo.updateIncome(income.id, { totalAmount: 80 })
    remote.account = {
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    remote.missingIds.add(`income_records:${income.id}`)
    const missing = await engine.sync(USER_A)
    expect(missing.errors).toEqual([{
      table: 'income_records',
      id: income.id,
      message: HISTORY_LOCKED_MESSAGE,
      code: 'HISTORY_LOCKED',
    }])
    expect(repo.getRow('income_records', income.id)?.deleted_at).toBeNull()
    expect(repo.getRow('income_records', income.id)?.dirty).toBe(false)
    expect(repo.getRow('income_records', income.id)?.values.total_amount).toBe('100.00')
    const incomeAttempts = remote.payloads.filter((entry) => entry.payload.id === income.id).length
    await engine.sync(USER_A)
    expect(remote.payloads.filter((entry) => entry.payload.id === income.id)).toHaveLength(incomeAttempts)
  })

  it('restores a local delete of an old row and uploads it again on Pro', async () => {
    const { repo, remote, engine } = harness()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const expense = repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: '2020-01-01',
    })
    await engine.sync(USER_A)
    repo.softDeleteExpense(expense.id)
    remote.account = {
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    remote.lockedIds.add(`expenses:${expense.id}`)
    const refused = await engine.sync(USER_A)
    expect(refused.errors.map((error) => error.code)).toEqual(['HISTORY_LOCKED'])
    expect(repo.getRow('expenses', expense.id)?.deleted_at).toBeNull()
    expect(remote.get('expenses', expense.id)?.deleted_at).toBeNull()

    remote.lockedIds.clear()
    remote.account = {
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2020-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    }
    const released = await engine.sync(USER_A)
    expect(released.errors).toEqual([])
    expect(repo.isHistoryLocked('expenses', expense.id)).toBe(false)
    repo.updateExpense(expense.id, { amount: 25 })
    const upgraded = await engine.sync(USER_A)
    expect(upgraded.errors).toEqual([])
    expect(repo.getRow('expenses', expense.id)?.dirty).toBe(false)
    expect(remote.get('expenses', expense.id)?.amount).toBe(25)
  })
})
