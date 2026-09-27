'use server'

import { revalidatePath } from 'next/cache'
import { getFounderUser } from '@/lib/founder/access'
import { getResendConfig, sendTransactionalEmail } from '@/lib/email/resend'
import { sendSupportReply, setSupportStatus, type SupportActionResult, type SupportMailer } from '@/lib/founder/support'
import { supabaseSupportStore } from '@/lib/founder/supportData'

const NOT_AUTHORIZED: SupportActionResult = { ok: false, message: 'Not authorized.' }

const mail: SupportMailer = async (message, idempotencyKey) => {
  const config = getResendConfig()
  if (!config.ok) return config
  return sendTransactionalEmail(config.config, message, idempotencyKey)
}

async function run(action: () => Promise<SupportActionResult>): Promise<SupportActionResult> {
  try {
    return await action()
  } catch (e) {
    console.error(`[support] action failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    return { ok: false, message: 'Something went wrong. Nothing was sent — try again.' }
  } finally {
    revalidatePath('/admin/founder', 'layout')
  }
}

/** Recipient, requester and sender are all resolved on the server; the browser supplies only the draft. */
export async function sendSupportReplyAction(input: {
  requestId: string
  replyId: string
  body: string
  resolveAfter: boolean
}): Promise<SupportActionResult> {
  const founder = await getFounderUser()
  if (!founder) return NOT_AUTHORIZED
  return run(() =>
    sendSupportReply(
      { store: supabaseSupportStore, mail, now: new Date() },
      { requestId: input?.requestId, replyId: input?.replyId, body: input?.body, resolveAfter: input?.resolveAfter, founderId: founder.id }
    )
  )
}

export async function setSupportStatusAction(requestId: string, status: 'open' | 'resolved'): Promise<SupportActionResult> {
  const founder = await getFounderUser()
  if (!founder) return NOT_AUTHORIZED
  return run(() => setSupportStatus({ store: supabaseSupportStore, now: new Date() }, { requestId, status, founderId: founder.id }))
}
