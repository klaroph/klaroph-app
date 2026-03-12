import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendAccountDeletedEmail } from '@/lib/accountDeletedEmail'

type Body = { email?: string }

/**
 * POST /api/delete-account
 * Requires session; body must include email matching session user exactly.
 * Deletes user data in FK-safe order, sends confirmation email, then deletes auth user last. No service role on client.
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

    const userId = user.id

    // Delete in FK-safe order. Stop on first error.
    // 1) income_allocations (references income_records, goals) — optional table
    const { data: incomeRows } = await supabaseAdmin
      .from('income_records')
      .select('id')
      .eq('user_id', userId)
    const incomeRecordIds = (incomeRows ?? []).map((r) => r.id)
    const { data: goalRows } = await supabaseAdmin
      .from('goals')
      .select('id')
      .eq('user_id', userId)
    const goalIds = (goalRows ?? []).map((g) => g.id)
    if (incomeRecordIds.length > 0) {
      const { error: e1 } = await supabaseAdmin
        .from('income_allocations')
        .delete()
        .in('income_record_id', incomeRecordIds)
      if (e1 && e1.code !== '42P01') {
        console.error('Delete failed on income_allocations (income_record_id):', e1)
        return NextResponse.json(
          { error: 'Failed to delete account data. Please try again or contact support.' },
          { status: 500 }
        )
      }
    }
    if (goalIds.length > 0) {
      const { error: e2 } = await supabaseAdmin
        .from('income_allocations')
        .delete()
        .in('goal_id', goalIds)
      if (e2 && e2.code !== '42P01') {
        console.error('Delete failed on income_allocations (goal_id):', e2)
        return NextResponse.json(
          { error: 'Failed to delete account data. Please try again or contact support.' },
          { status: 500 }
        )
      }
    }

    // 2) expenses, 3) income_records, 4) goals, 5) budget_overrides, 6) budget_plans, 7) subscriptions
    const tablesByUserId: Array<[string, string]> = [
      ['expenses', 'user_id'],
      ['income_records', 'user_id'],
      ['goals', 'user_id'],
      ['budget_overrides', 'user_id'],
      ['budget_plans', 'user_id'],
      ['subscriptions', 'user_id'],
    ]
    for (const [table, col] of tablesByUserId) {
      const { error } = await supabaseAdmin.from(table).delete().eq(col, userId)
      if (error) {
        console.error(`Delete failed on ${table}:`, error)
        return NextResponse.json(
          { error: 'Failed to delete account data. Please try again or contact support.' },
          { status: 500 }
        )
      }
    }

    // 8) support_requests, 9) premium_confirmation_emails (optional), 10) assets, 11) liabilities
    const optionalTables: Array<[string, string]> = [
      ['support_requests', 'user_id'],
      ['premium_confirmation_emails', 'user_id'],
      ['assets', 'user_id'],
      ['liabilities', 'user_id'],
    ]
    for (const [table, col] of optionalTables) {
      const { error } = await supabaseAdmin.from(table).delete().eq(col, userId)
      if (error && error.code !== '42P01') {
        console.error(`Delete failed on ${table}:`, error)
        return NextResponse.json(
          { error: 'Failed to delete account data. Please try again or contact support.' },
          { status: 500 }
        )
      }
    }

    // 12) profiles
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)
    if (profileErr) {
      console.error('Delete failed on profiles:', profileErr)
      return NextResponse.json(
        { error: 'Failed to delete account. Please try again or contact support.' },
        { status: 500 }
      )
    }

    await sendAccountDeletedEmail(user.email)

    // Auth user last
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authErr) {
      console.error('Delete failed on auth user:', authErr)
      return NextResponse.json(
        { error: 'Account data was removed but sign-in could not be fully deleted. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete account unexpected error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again or contact support.' },
      { status: 500 }
    )
  }
}
