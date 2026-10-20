import { describe, expect, it } from 'vitest'
import { openTestRepository } from '../db/testDb'
import { commitEntry } from './actions'
import { orderCategoryChips, repeatChips } from './chips'
import { groupHistoryByDay, rowHeadline } from './historyGroups'
import { homeInsight } from './insight'
import type { HistoryRow } from './ledger'
import { daysToPaydayAt, daysToPaydayOn } from './payday'
import { emptyDraft } from './quickAdd'
import { toastForSave, undoSavedEntry } from './saveToast'

const NOW = new Date('2026-10-20T04:00:00.000Z')
const OCTOBER_B = { half: 'b' as const, month: '2026-10', start: '2026-10-15', end: '2026-10-30' }

function row(partial: {
  id: string
  kind?: HistoryRow['kind']
  date: string
  amount: number
  category: string
  description?: string
  createdAt?: string
}): HistoryRow {
  const kind = partial.kind ?? 'expense'
  return {
    id: partial.id,
    kind,
    date: partial.date,
    createdAt: partial.createdAt ?? '2026-10-20T00:00:00.000Z',
    amount: partial.amount,
    title: partial.category,
    category: partial.category,
    description: partial.description ?? '',
    icon: 'cart-outline',
    amountLabel: '',
    dateLabel: '',
    detail: kind === 'income' ? 'Income' : 'Need',
  }
}

describe('category chips', () => {
  it('sorts most-used first and keeps catalog order on a tie', () => {
    const uses = [
      { kind: 'expense' as const, category: 'Transportation' },
      { kind: 'expense' as const, category: 'Transportation' },
      { kind: 'expense' as const, category: 'Groceries' },
      { kind: 'expense' as const, category: 'Dining Out' },
      { kind: 'income' as const, category: 'Salary' },
    ]
    const ordered = orderCategoryChips('expense', 'Groceries', uses)
    expect(ordered[0]).toBe('Transportation')
    expect(ordered.indexOf('Groceries')).toBeLessThan(ordered.indexOf('Dining Out'))
    expect(ordered.indexOf('Dining Out')).toBeLessThan(ordered.indexOf('Rent / Mortgage'))
    expect(ordered.indexOf('Rent / Mortgage')).toBeLessThan(ordered.indexOf('Utilities'))
    const income = orderCategoryChips('income', 'Salary', [
      { kind: 'income', category: 'Freelance / Online Work' },
      { kind: 'income', category: 'Freelance / Online Work' },
      { kind: 'expense', category: 'Groceries' },
    ])
    expect(income[0]).toBe('Freelance / Online Work')
    expect(income[1]).toBe('Salary')
  })

  it('offers the newest unique note as a repeat chip', () => {
    const chips = repeatChips([
      row({ id: '1', date: '2026-10-20', amount: 13, category: 'Transportation', description: 'Jeep', createdAt: '2026-10-20T02:00:00.000Z' }),
      row({ id: '2', date: '2026-10-20', amount: 13, category: 'Transportation', description: 'Jeep', createdAt: '2026-10-20T01:00:00.000Z' }),
      row({ id: '3', date: '2026-10-19', amount: 250, category: 'Dining Out', description: 'Jollibee', createdAt: '2026-10-19T01:00:00.000Z' }),
    ])
    expect(chips.map((chip) => chip.label)).toEqual(['Jeep ₱13', 'Jollibee ₱250'])
    expect(chips[0]?.category).toBe('Transportation')
  })
})

describe('save toast', () => {
  it('shows the payday remainder immediately and undo soft-deletes', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    const saved = commitEntry(repo, {
      ...emptyDraft('2026-10-20'),
      amount: '250',
      category: 'Dining Out',
      description: 'Jollibee',
    }, NOW)
    const started = performance.now()
    const toast = toastForSave({
      budget: 12000,
      spentBefore: 8500,
      row: saved,
      period: OCTOBER_B,
    })
    expect(toast.message).toBe('Saved · ₱3,250.00 left until payday')
    expect(performance.now() - started).toBeLessThan(300)
    expect(repo.getRow('expenses', saved.id)?.deleted_at).toBeNull()
    undoSavedEntry(repo, saved, NOW)
    expect(repo.getRow('expenses', saved.id)?.deleted_at).toBeTruthy()
  })
})

describe('history days', () => {
  it('groups a day header with the net total and prefers the note', () => {
    const days = groupHistoryByDay([
      row({ id: '1', date: '2026-10-20', amount: 1240.5, category: 'Groceries', description: 'Puregold weekly' }),
      row({ id: '2', date: '2026-10-20', amount: 13, category: 'Transportation', description: 'Jeep to Ortigas' }),
      row({ id: '3', date: '2026-10-18', amount: 650, category: 'Dining Out', description: '' }),
      row({ id: '4', date: '2026-10-15', amount: 18500, category: 'Salary', kind: 'income' }),
    ], '2026-10-20')
    expect(days.map((day) => day.date)).toEqual(['2026-10-20', '2026-10-18', '2026-10-15'])
    expect(days[0]?.title).toBe('TODAY · TUE, OCT 20')
    expect(days[0]?.totalLabel).toBe('−₱1,253.50')
    expect(days[0]?.rows.map(rowHeadline)).toEqual(['Puregold weekly', 'Jeep to Ortigas'])
    expect(rowHeadline(days[1]!.rows[0]!)).toBe('Dining Out')
    expect(days[1]?.title).toBe('SUN, OCT 18')
    expect(days[2]?.totalLabel).toBe('+₱18,500.00')
    expect(days[2]?.title).toBe('THU, OCT 15')
  })
})

describe('days to payday', () => {
  it('counts Oct 14, 15, 30, 31 and a non-leap Feb 28, and rolls at Manila midnight', () => {
    expect(daysToPaydayOn('2026-10-14')).toMatchObject({
      days: 1,
      payday: '2026-10-15',
      paydayLabel: 'Thu, Oct 15',
      period: { half: 'a', month: '2026-10', start: '2026-09-30', end: '2026-10-14' },
    })
    expect(daysToPaydayOn('2026-10-15')).toMatchObject({
      days: 16,
      payday: '2026-10-31',
      paydayLabel: 'Sat, Oct 31',
      period: { half: 'b', month: '2026-10', start: '2026-10-15', end: '2026-10-30' },
    })
    expect(daysToPaydayOn('2026-10-30')).toMatchObject({
      days: 1,
      payday: '2026-10-31',
      period: { half: 'b', end: '2026-10-30' },
    })
    expect(daysToPaydayOn('2026-10-31')).toMatchObject({
      days: 15,
      payday: '2026-11-15',
      period: { half: 'a', month: '2026-11', start: '2026-10-31', end: '2026-11-14' },
    })
    expect(daysToPaydayOn('2026-02-28')).toMatchObject({
      days: 15,
      payday: '2026-03-15',
      period: { half: 'a', month: '2026-03', start: '2026-02-28', end: '2026-03-14' },
    })
    expect(daysToPaydayAt(new Date('2026-10-14T15:59:59.000Z')).days).toBe(1)
    expect(daysToPaydayAt(new Date('2026-10-14T16:00:00.000Z')).days).toBe(16)
  })
})

describe('home insight', () => {
  it('compares food with the previous kinsena when both periods have some', () => {
    expect(homeInsight({
      foodSpent: 82,
      previousFoodSpent: 100,
      topCategory: 'Groceries',
      daysLogged: 4,
      hasActivity: true,
    })).toBe('You spent 18% less on food than last kinsena')
    expect(homeInsight({
      foodSpent: 0,
      previousFoodSpent: 0,
      topCategory: null,
      daysLogged: 0,
      hasActivity: false,
    })).toBeNull()
  })
})
