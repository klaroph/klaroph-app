import { afterEach, describe, expect, it, vi } from 'vitest'
import { isImportQuotaExceededError, plainDbError, plainDbErrorText } from './apiError'

const GOAL_LIMIT_COPY =
  "You've reached the Free limit. Explore KlaroPH Pro to unlock up to 20 goals."
const GRACE_COPY =
  'Goal creation is paused while your payment is being updated. Please update your payment method.'
const IMPORT_LIMIT_COPY =
  "You've used your 2 free imports. Explore KlaroPH Pro for unlimited CSV imports."

describe('plainDbError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps save, delete, load, and generic intents to the plain buckets', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = { message: 'duplicate key value violates unique constraint "expenses_pkey"', code: '23505' }

    expect(plainDbError(raw, 'save')).toBe('Couldn’t save that.')
    expect(plainDbError(raw, 'delete')).toBe('Couldn’t delete that.')
    expect(plainDbError(raw, 'load')).toBe('Couldn’t load that.')
    expect(plainDbError(raw, 'generic')).toBe('Something went wrong.')
    expect(plainDbErrorText).toEqual({
      save: 'Couldn’t save that.',
      delete: 'Couldn’t delete that.',
      load: 'Couldn’t load that.',
      generic: 'Something went wrong.',
    })
  })

  it('logs the raw error and does not echo it to the client', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = {
      message: 'permission denied for table goals',
      code: '42501',
      details: 'policy expenses_insert',
      hint: null,
    }

    const message = plainDbError(raw, 'save', 'POST /api/goals insert error:')

    expect(spy).toHaveBeenCalledWith('POST /api/goals insert error:', raw)
    expect(message).toBe(plainDbErrorText.save)
    expect(message).not.toContain('permission denied')
    expect(message).not.toContain('42501')
  })

  it('does not remap known product codes into product copy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const productErrors = [
      { message: 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals', code: 'P0001' },
      {
        message:
          'GOAL_CREATION_GRACE: goal creation is blocked while the subscription is past due and still in grace',
        code: 'P0001',
      },
      { message: 'IMPORT_QUOTA_EXCEEDED: free import quota is already used', code: 'P0001' },
      { message: 'import_count is not updatable by client', code: '42501' },
      { message: 'Total allocations cannot exceed income amount.' },
      { message: 'Income record not found or unauthorized' },
      { message: 'Row 1: invalid date.' },
      { message: 'Invalid total_amount.' },
    ]

    for (const error of productErrors) {
      const message = plainDbError(error, 'save', 'test')
      expect(message).toBe(plainDbErrorText.save)
      expect(message).not.toBe(GOAL_LIMIT_COPY)
      expect(message).not.toBe(GRACE_COPY)
      expect(message).not.toBe(IMPORT_LIMIT_COPY)
      expect(message).not.toContain('GOAL_')
      expect(message).not.toContain('IMPORT_')
    }
  })
})

describe('isImportQuotaExceededError', () => {
  it('returns true only when the message or details contain IMPORT_QUOTA_EXCEEDED', () => {
    expect(
      isImportQuotaExceededError({
        message: 'IMPORT_QUOTA_EXCEEDED: free import quota is already used',
        code: 'P0001',
      })
    ).toBe(true)
    expect(
      isImportQuotaExceededError({
        message: 'quota check failed',
        details: 'IMPORT_QUOTA_EXCEEDED: free import quota is already used',
      })
    ).toBe(true)
  })

  it('does not treat the 42501 import_count protect error or other product codes as the import limit', () => {
    expect(
      isImportQuotaExceededError({
        message: 'import_count is not updatable by client',
        code: '42501',
      })
    ).toBe(false)
    expect(
      isImportQuotaExceededError({
        message: 'permission denied for function consume_import_quota',
        code: '42501',
      })
    ).toBe(false)
    expect(
      isImportQuotaExceededError({
        message: 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals',
        code: 'P0001',
      })
    ).toBe(false)
    expect(isImportQuotaExceededError(null)).toBe(false)
  })
})
