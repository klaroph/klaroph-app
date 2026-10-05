import { NextResponse } from 'next/server'
import { wipeUserAccount } from '@/lib/accountWipe'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseUserActionStore } from '@/lib/founder/userActionsData'
import { sendAccountDeletedEmail } from '@/lib/accountDeletedEmail'

type Body = { email?: string }

const WIPE_FAILED = 'Failed to delete account data. Please try again or contact support.'

/**
 * POST /api/delete-account
 * Requires session; body must include email matching session user exactly.
 * Uses the same wipe as founder Mission Control: unlinked rows, then auth-user cascade.
 * A failure returns before the auth user is removed, so profile and child rows stay intact.
 * No service role on the client.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser()
    if (sessionError) {
      return NextResponse.json(
        { error: 'Session invalid. Please sign in again.' },
        { status: 401 }
      )
    }
    if (!user?.email) {
      return NextResponse.json(
        { error: 'No account email found.' },
        { status: 401 }
      )
    }

    let body: Body
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      )
    }
    const submittedEmail = typeof body?.email === 'string' ? body.email.trim() : ''
    if (submittedEmail !== user.email) {
      return NextResponse.json(
        { error: 'Email does not match your account.' },
        { status: 400 }
      )
    }

    try {
      await wipeUserAccount(supabaseUserActionStore, user.id)
    } catch (err) {
      console.error('Delete account failed before the auth user was removed:', err)
      return NextResponse.json({ error: WIPE_FAILED }, { status: 500 })
    }

    await sendAccountDeletedEmail(user.email)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete account unexpected error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again or contact support.' },
      { status: 500 }
    )
  }
}
