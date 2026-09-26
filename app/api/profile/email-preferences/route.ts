import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getEmailPreferences, setProductUpdates, type EmailPreferencesResult } from '@/lib/emailPreferences'

export const dynamic = 'force-dynamic'

function respond(result: EmailPreferencesResult) {
  return result.ok
    ? NextResponse.json(result.preferences, { headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: result.error }, { status: result.status })
}

async function authedClient() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/** GET — current user's email preferences. */
export async function GET() {
  try {
    const { supabase, user } = await authedClient()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return respond(await getEmailPreferences(supabase, user.id))
  } catch (e) {
    console.error('GET /api/profile/email-preferences', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

/** PATCH { productUpdates: boolean } — always applies to the signed-in user's own profile. */
export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await authedClient()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    if (typeof body?.productUpdates !== 'boolean') {
      return NextResponse.json({ error: 'productUpdates must be true or false.' }, { status: 400 })
    }
    return respond(await setProductUpdates(supabase, user.id, body.productUpdates))
  } catch (e) {
    console.error('PATCH /api/profile/email-preferences', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
