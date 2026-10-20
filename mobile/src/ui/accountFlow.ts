import type { SignInPreview, SyncReport } from '../sync/engine'
import type { LocalStore } from '../sync/localStore'
import { activateAccount, signOut } from '../sync/session'
import type { TokenStore } from '../sync/tokenStore'

export type AccountEngine = {
  preview(userId: string): Promise<SignInPreview>
  adopt(userId: string): Promise<void>
  sync(userId: string): Promise<SyncReport>
}

export type SignInResult = {
  isolated: boolean
  goalLimitMessage: string | null
  report: SyncReport | null
}

/**
 * First sign-in keeps local rows. Adoption is skipped when the engine reports
 * a goal-limit or grace block, so no user id is assigned in that case.
 * Sync runs only when the switch is on.
 */
export async function signInAndAdopt(input: {
  local: LocalStore
  tokens: TokenStore
  userId: string
  tokenKey: string
  tokenValue: string
  engine: AccountEngine
  syncEnabled: boolean
}): Promise<SignInResult> {
  const activated = await activateAccount({
    local: input.local,
    tokens: input.tokens,
    userId: input.userId,
    tokenKey: input.tokenKey,
    tokenValue: input.tokenValue,
  })
  const preview = await input.engine.preview(input.userId)
  if (preview.goalLimitMessage == null) await input.engine.adopt(input.userId)
  const report = input.syncEnabled ? await input.engine.sync(input.userId) : null
  return {
    isolated: activated.isolated,
    goalLimitMessage: preview.goalLimitMessage,
    report,
  }
}

export async function signOutKeepingIntro(input: {
  local: LocalStore
  tokens: TokenStore
  restoreIntro: boolean
  markIntroDone: () => void
}): Promise<void> {
  await signOut({ local: input.local, tokens: input.tokens })
  if (input.restoreIntro) input.markIntroDone()
}
