import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/legalVersions'

/**
 * POST — Record acceptance of current Terms and Privacy (e.g. after legal-update page).
 * Requires authenticated user. Uses supabaseAdmin to update profile.
 * If profile is already on current versions, returns 200 without overwriting timestamps.
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('terms_version, privacy_version')
      .eq('id', user.id)
      .single()

    const alreadyCurrent =
      profile?.terms_version === TERMS_VERSION && profile?.privacy_version === PRIVACY_VERSION
    if (alreadyCurrent) {
      return NextResponse.json({ ok: true })
    }

    const now = new Date().toISOString()
    const payload = {
      terms_accepted_at: now,
      privacy_accepted_at: now,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (updated) {
      return NextResponse.json({ ok: true })
    }

    // Profile row may not exist (e.g. created before trigger); upsert consent so user can proceed.
    const { error: upsertError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name ?? user.email ?? 'User',
        onboarding_completed: false,
        ...payload,
      },
      { onConflict: 'id' }
    )
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/legal/accept', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
