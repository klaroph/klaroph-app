import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/legalVersions'

/**
 * POST — Record legal consent for the current user.
 * Only sets terms_accepted_at, privacy_accepted_at, terms_version, privacy_version
 * when they are currently null (never overwrites existing timestamps).
 * Uses server-side client; RLS profiles_update_own allows own-row update.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: selectError } = await supabase
      .from('profiles')
      .select('terms_accepted_at, privacy_accepted_at, terms_version, privacy_version')
      .eq('id', user.id)
      .single()

    if (selectError && selectError.code !== 'PGRST116') {
      return NextResponse.json(
        { error: selectError.message },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()
    const update = {
      terms_accepted_at: profile?.terms_accepted_at ?? now,
      privacy_accepted_at: profile?.privacy_accepted_at ?? now,
      terms_version: profile?.terms_version ?? TERMS_VERSION,
      privacy_version: profile?.privacy_version ?? PRIVACY_VERSION,
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/profile/consent', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
