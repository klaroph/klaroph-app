import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getUnsubscribeSecret, verifyUnsubscribeToken } from '@/lib/email/unsubscribeToken'

export const dynamic = 'force-dynamic'

type Outcome = 'done' | 'invalid' | 'error'

async function unsubscribe(token: string | null): Promise<Outcome> {
  const secret = getUnsubscribeSecret()
  if (!secret) return 'error'
  const userId = verifyUnsubscribeToken(token, secret)
  if (!userId) return 'invalid'

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ marketing_emails_unsubscribed_at: new Date().toISOString() })
    .eq('id', userId)
    .is('marketing_emails_unsubscribed_at', null)
  if (error) {
    console.error('POST /api/email/unsubscribe update failed:', error.message)
    return 'error'
  }
  return 'done'
}

/** Links never mutate on GET (mail scanners prefetch links) — send people to the confirm page. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const target = new URL('/unsubscribe', url.origin)
  const token = url.searchParams.get('token')
  if (token) target.searchParams.set('token', token)
  return NextResponse.redirect(target, 303)
}

/**
 * POST — RFC 8058 one-click (List-Unsubscribe-Post) or the /unsubscribe confirm form.
 * The form sends `source=page` and is redirected back with the outcome.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  let form: FormData | null = null
  try {
    form = await request.formData()
  } catch {
    form = null
  }
  const token = url.searchParams.get('token') ?? (form?.get('token') as string | null) ?? null
  const outcome = await unsubscribe(token)

  if (form?.get('source') === 'page') {
    const target = new URL('/unsubscribe', url.origin)
    target.searchParams.set('status', outcome)
    return NextResponse.redirect(target, 303)
  }

  const status = outcome === 'done' ? 200 : outcome === 'invalid' ? 400 : 500
  return NextResponse.json({ ok: outcome === 'done' }, { status, headers: { 'Cache-Control': 'no-store' } })
}
