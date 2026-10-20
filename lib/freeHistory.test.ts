import { describe, expect, it } from 'vitest'
import { freeHistoryCutoffDate, historySkipMessage, isOlderThanFreeHistory, partitionFreeHistory } from './freeHistory'

const now = new Date(2026, 9, 20)

describe('free history partition', () => {
  it('uses the same calendar cutoff as the select policy', () => {
    expect(freeHistoryCutoffDate(now)).toBe('2026-07-22')
    expect(isOlderThanFreeHistory('2026-07-21', now)).toBe(true)
    expect(isOlderThanFreeHistory('2026-07-22', now)).toBe(false)
  })

  it('keeps rows on the cutoff day and counts the older ones', () => {
    const rows = [
      { date: '2020-01-01', amount: 1 },
      { date: '2026-07-22', amount: 2 },
      { date: '2026-10-01', amount: 3 },
    ]
    expect(partitionFreeHistory(rows, true, now)).toEqual({
      keep: [rows[1], rows[2]],
      skipped: 1,
    })
    expect(partitionFreeHistory(rows, false, now)).toEqual({ keep: rows, skipped: 0 })
    expect(historySkipMessage(2)).toBe(
      '2 entries older than 90 days were skipped. Upgrade to Pro to import them.',
    )
  })
})
