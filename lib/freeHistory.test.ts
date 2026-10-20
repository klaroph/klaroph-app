import { describe, expect, it } from 'vitest'
import { freeHistoryCutoffDate, historySkipMessage, isOlderThanFreeHistory, partitionFreeHistory } from './freeHistory'

/** 08:00 Asia/Manila on 2026-10-20, which is still 2026-10-19 in Los Angeles. */
const eightAmManila = new Date('2026-10-20T00:00:00.000Z')
/** 23:59 Asia/Manila on 2026-10-19. */
const beforeManilaDay = new Date('2026-10-19T15:59:59.000Z')
/** 00:00 Asia/Manila on 2026-10-20, 09:00 the previous morning in Los Angeles. */
const manilaMidnight = new Date('2026-10-19T16:00:00.000Z')

describe('free history partition', () => {
  it('uses the Manila calendar date, including across 8 AM Manila', () => {
    expect(freeHistoryCutoffDate(beforeManilaDay)).toBe('2026-07-21')
    expect(freeHistoryCutoffDate(manilaMidnight)).toBe('2026-07-22')
    expect(freeHistoryCutoffDate(eightAmManila)).toBe('2026-07-22')
    expect(freeHistoryCutoffDate(new Date('2026-10-19T23:59:00.000Z'))).toBe('2026-07-22')
    expect(isOlderThanFreeHistory('2026-07-21', eightAmManila)).toBe(true)
    expect(isOlderThanFreeHistory('2026-07-22', eightAmManila)).toBe(false)
  })

  it('keeps rows on the cutoff day and counts the older ones', () => {
    const rows = [
      { date: '2020-01-01', amount: 1 },
      { date: '2026-07-22', amount: 2 },
      { date: '2026-10-01', amount: 3 },
    ]
    expect(partitionFreeHistory(rows, true, eightAmManila)).toEqual({
      keep: [rows[1], rows[2]],
      skipped: 1,
    })
    expect(partitionFreeHistory(rows, false, eightAmManila)).toEqual({ keep: rows, skipped: 0 })
  })

  it('pluralizes the skip message and keeps the upgrade sentence', () => {
    expect(historySkipMessage(1)).toBe(
      '1 entry older than 90 days was skipped. Upgrade to Pro to import them.',
    )
    expect(historySkipMessage(2)).toBe(
      '2 entries older than 90 days were skipped. Upgrade to Pro to import them.',
    )
  })
})
