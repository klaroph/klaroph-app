import type { LocalStore } from './localStore'
import type { TokenStore } from './tokenStore'

export type ActivateResult = {
  /** True when a different signed-in user was replaced and their local data was removed. */
  isolated: boolean
}

/**
 * First sign-in keeps local-only rows. Switching from one account to another
 * removes the previous account's rows and token before the new session is stored.
 */
export async function activateAccount(input: {
  local: LocalStore
  tokens: TokenStore
  userId: string
  tokenKey: string
  tokenValue: string
}): Promise<ActivateResult> {
  const previous = input.local.sessionUserId()
  if (previous && previous !== input.userId) {
    input.local.clearAll()
    await input.tokens.clear()
    input.local.setSessionUserId(input.userId)
    await input.tokens.set(input.tokenKey, input.tokenValue)
    return { isolated: true }
  }
  input.local.setSessionUserId(input.userId)
  await input.tokens.set(input.tokenKey, input.tokenValue)
  return { isolated: false }
}

/** Drops the auth token and every local row, including sync cursors. */
export async function signOut(input: { local: LocalStore; tokens: TokenStore }): Promise<void> {
  await input.tokens.clear()
  input.local.clearAll()
}
