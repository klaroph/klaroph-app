import { describe, expect, it } from 'vitest'
import { openTestRepository } from '../db/testDb'
import { commitEntry } from '../ui/actions'
import { loadLedger, pageHistory, patchHome } from '../ui/ledger'
import { emptyDraft } from '../ui/quickAdd'
import { seedExpenses, timeQuickAdds } from './quickAddPerf'

const NOW = new Date('2026-10-20T04:00:00.000Z')

describe('large history', () => {
  it('pages history and keeps a quick add under 3 seconds with 1,000 rows', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    expect(seedExpenses(repo, 1000, '2026-10-20')).toBe(1000)
    const first = pageHistory(repo, NOW, null, 40)
    expect(first.rows).toHaveLength(40)
    expect(first.hasMore).toBe(true)
    const second = pageHistory(repo, NOW, first.cursor, 40)
    expect(second.rows).toHaveLength(40)
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(80)

    const sample = timeQuickAdds(repo, NOW, 10)
    const started = repo.countVisibleEntries()
    let view = loadLedger(repo, NOW)
    for (let index = 0; index < 200; index += 1) {
      const row = commitEntry(repo, { ...emptyDraft('2026-10-20'), amount: '3.00' }, NOW)
      view = patchHome(view, { type: 'insert', row })
    }
    expect(view.spent).toBeGreaterThan(0)
    expect(repo.countVisibleEntries()).toBe(started + 200)
    expect(sample.max).toBeLessThan(3000)
    expect(sample.median).toBeLessThan(3000)
    console.log(`quick-add 1000 rows median=${sample.median.toFixed(2)}ms max=${sample.max.toFixed(2)}ms times=${sample.times.map((time) => time.toFixed(2)).join(',')}`)
  })

  it('adds 300 rows in a row after a 1,000-row seed', () => {
    const { repo } = openTestRepository({ now: () => NOW })
    expect(seedExpenses(repo, 1000, '2026-10-20')).toBe(1000)
    const started = repo.countVisibleEntries()
    for (let index = 0; index < 300; index += 1) {
      commitEntry(repo, { ...emptyDraft('2026-10-20'), amount: '4.00' }, NOW)
    }
    expect(repo.countVisibleEntries()).toBe(started + 300)
  })
})
