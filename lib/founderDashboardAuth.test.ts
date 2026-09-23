import { describe, expect, it } from 'vitest'
import { authorizeFounderDashboardRequest } from './founderDashboardAuth'

describe('authorizeFounderDashboardRequest', () => {
  it('requires a configured secret — missing secret is not public access', () => {
    const result = authorizeFounderDashboardRequest('Bearer anything', undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })

  it('rejects a missing or wrong bearer token', () => {
    expect(authorizeFounderDashboardRequest(null, 'secret').ok).toBe(false)
    expect(authorizeFounderDashboardRequest('Bearer other', 'secret').ok).toBe(false)
  })

  it('accepts the matching bearer token', () => {
    expect(authorizeFounderDashboardRequest('Bearer secret', 'secret').ok).toBe(true)
  })
})
