'use server'

import { revalidatePath } from 'next/cache'
import { getFounderUser } from '@/lib/founder/access'
import { sendAccountDeletedEmail } from '@/lib/accountDeletedEmail'
import { getResendConfig, sendTransactionalEmail } from '@/lib/email/resend'
import { deleteUserAccount, grantComplimentaryPro, type UserActionMailer, type UserActionResult } from '@/lib/founder/userActions'
import { supabaseUserActionStore } from '@/lib/founder/userActionsData'

const NOT_AUTHORIZED: UserActionResult = { ok: false, message: 'Not authorized.' }

const mail: UserActionMailer = async (message, idempotencyKey) => {
  const config = getResendConfig()
  if (!config.ok) return config
  return sendTransactionalEmail(config.config, message, idempotencyKey)
}

async function run(label: string, action: () => Promise<UserActionResult>): Promise<UserActionResult> {
  try {
    return await action()
  } catch (e) {
    console.error(`[founder-users] ${label} failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    return { ok: false, message: 'Something went wrong. Refresh to see the current state, then try again.' }
  } finally {
    revalidatePath('/admin/founder', 'layout')
  }
}

/** The browser sends only the target id and the chosen length; account, email and plan are read on the server. */
export async function grantComplimentaryProAction(input: { userId: string; duration: string }): Promise<UserActionResult> {
  if (!(await getFounderUser())) return NOT_AUTHORIZED
  return run('grant complimentary Pro', () =>
    grantComplimentaryPro({ store: supabaseUserActionStore, mail, now: new Date() }, { userId: input?.userId, duration: input?.duration })
  )
}

/** The typed email and phrase are confirmations only; the server compares them against the account it loads itself. */
export async function deleteUserAction(input: { userId: string; confirmEmail: string; confirmPhrase: string }): Promise<UserActionResult> {
  const founder = await getFounderUser()
  if (!founder) return NOT_AUTHORIZED
  return run('delete user', () =>
    deleteUserAccount(
      { store: supabaseUserActionStore, founder, founderEmail: process.env.FOUNDER_EMAIL, notifyDeleted: sendAccountDeletedEmail },
      { userId: input?.userId, confirmEmail: input?.confirmEmail, confirmPhrase: input?.confirmPhrase }
    )
  )
}
