import { describe, expect, it } from 'vitest'
import { keysetOr, pullLowerBound } from './cursor'
import { decidePull } from './merge'
import { toPushPayload, type SyncRow } from './model'

describe('pull merge', () => {
  const base = '2026-10-01T00:00:00.000Z'

  it('keeps a dirty local tombstone over a newer remote edit', () => {
    expect(decidePull(
      { dirty: true, deleted_at: base, base_updated_at: base },
      { deleted_at: null, updated_at: '2026-10-02T00:00:00.000Z' },
    )).toBe('keep-local')
  })

  it('applies a remote tombstone over a dirty local edit', () => {
    expect(decidePull(
      { dirty: true, deleted_at: null, base_updated_at: base },
      { deleted_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z' },
    )).toBe('apply-remote')
  })

  it('keeps a pending edit when the pull is the same server version', () => {
    expect(decidePull(
      { dirty: true, deleted_at: null, base_updated_at: base },
      { deleted_at: null, updated_at: base },
    )).toBe('keep-local')
  })

  it('lets a newer server write replace a pending edit', () => {
    expect(decidePull(
      { dirty: true, deleted_at: null, base_updated_at: base },
      { deleted_at: null, updated_at: '2026-10-02T00:00:00.000Z' },
    )).toBe('apply-remote')
  })

  it('does not resurrect a synced tombstone', () => {
    expect(decidePull(
      { dirty: false, deleted_at: base, base_updated_at: base },
      { deleted_at: null, updated_at: '2026-10-02T00:00:00.000Z' },
    )).toBe('keep-local')
  })
})

describe('push payload', () => {
  const row: SyncRow = {
    table: 'goals',
    id: 'goal-1',
    user_id: 'user-1',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    deleted_at: null,
    dirty: true,
    base_updated_at: '2026-10-01T00:00:00.000Z',
    revision: 1,
    values: {
      name: 'Emergency',
      target_amount: '100.00',
      saved_amount: '40.00',
      pinned_at: null,
    },
  }

  it('omits updated_at, saved_amount, and a null deleted_at', () => {
    const payload = toPushPayload(row)
    expect(payload).not.toHaveProperty('updated_at')
    expect(payload).not.toHaveProperty('saved_amount')
    expect(payload).not.toHaveProperty('deleted_at')
    expect(payload).toMatchObject({ id: 'goal-1', name: 'Emergency', target_amount: 100 })
  })

  it('sends deleted_at only when the row is a tombstone', () => {
    const payload = toPushPayload({ ...row, deleted_at: '2026-10-03T00:00:00.000Z' })
    expect(payload.deleted_at).toBe('2026-10-03T00:00:00.000Z')
  })
})

describe('cursor', () => {
  it('opens the next pull an overlap before the cursor', () => {
    expect(pullLowerBound('2026-10-01T00:05:00.000Z', 5 * 60 * 1000)).toBe('2026-10-01T00:00:00.000Z')
    expect(pullLowerBound(null, 1000)).toBeNull()
  })

  it('quotes timestamps so PostgREST does not split on the decimal point', () => {
    expect(keysetOr('2026-10-01T00:00:00.000Z', 'abc')).toBe(
      'updated_at.gt."2026-10-01T00:00:00.000Z",and(updated_at.eq."2026-10-01T00:00:00.000Z",id.gt."abc")',
    )
  })
})
