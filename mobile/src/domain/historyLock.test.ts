import { describe, expect, it } from 'vitest'
import { freeHistoryCutoffDate, isOlderThanFreeHistory, minimumSelectableHistoryDate } from './historyLock'

const now = new Date(2026, 9, 20)

describe('free history picker', () => {
  it('stops a Free picker on the same 90-day cutoff and leaves other plans open', () => {
    expect(freeHistoryCutoffDate(now)).toBe('2026-07-22')
    expect(isOlderThanFreeHistory('2026-07-21', now)).toBe(true)
    expect(isOlderThanFreeHistory('2026-07-22', now)).toBe(false)
    expect(minimumSelectableHistoryDate('Free', now)).toEqual(new Date(2026, 6, 22))
    expect(minimumSelectableHistoryDate('Pro', now)).toBeUndefined()
    expect(minimumSelectableHistoryDate('Clarity Premium', now)).toBeUndefined()
    expect(minimumSelectableHistoryDate(null, now)).toBeUndefined()
    expect(minimumSelectableHistoryDate(undefined, now)).toBeUndefined()
  })
})
