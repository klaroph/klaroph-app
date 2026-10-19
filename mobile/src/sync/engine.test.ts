import { describe, expect, it } from 'vitest'
import { DomainError } from '../domain/errors'
import { openTestRepository } from '../db/testDb'
import type { KlaroRepository } from '../db/repository'
import { SyncEngine } from './engine'
import type { PullPageInput } from './cursor'
import type { ServerStamp, SyncedTable } from './model'
import type { RemoteSync } from './remote'
import { activateAccount, signOut } from './session'
import { MemoryTokenStore } from './tokenStore'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
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

  async push(table: SyncedTable, payload: Record<string, unknown>): Promise<ServerStamp> {
    this.payloads.push({ table, payload: { ...payload } })
    if ('deleted_at' in payload && payload.deleted_at == null) this.clearedDeletedAt += 1
    if ('saved_amount' in payload) this.savedAmountSends += 1
    if ('updated_at' in payload) this.updatedAtSends += 1
    const id = String(payload.id)
    const existing = this.rows.get(this.key(table, id))
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
    if (this.failNext) {
      this.failNext = false
      throw new Error('response lost')
    }
    return { id, updated_at: updatedAt, deleted_at: deletedAt }
  }

  async countLive(table: SyncedTable, userId: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.table === table && row.user_id === userId && row.deleted_at == null).length
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
      date: '2026-02-01',
    })
    remote.insert('expenses', {
      id: 'server-expense',
      user_id: USER_A,
      category: 'Rent',
      type: 'needs',
      amount: 100,
      date: '2026-02-01',
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

    engine.adopt(USER_A)
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-01',
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
      date: '2026-02-02',
    })
    repo.softDeleteExpense(fresh.id)
    await engine.sync(USER_A)
    expect(remote.get('expenses', fresh.id)).toBeUndefined()
    expect(repo.getRow('expenses', fresh.id)).toBeNull()
  })

  it('reports a budget category clash instead of upserting on the partial unique index', async () => {
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
    expect(report.errors.some((error) => error.code === 'UNIQUE_CONFLICT' || error.code === '23505')).toBe(true)
    expect(repo.getRow('budget_plans', local.id)?.deleted_at).toBeNull()
    expect(repo.getRow('budget_plans', 'server-plan')).toBeNull()
  })

  it('clears rows, cursors, and the token on sign-out', async () => {
    const { repo, remote, engine, tokens } = harness()
    repo.createExpense({
      userId: USER_A,
      category: 'Groceries',
      type: 'needs',
      amount: 20,
      date: '2026-02-01',
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
      date: '2026-02-01',
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
})
