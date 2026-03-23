import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** Redeem validates + inserts voucher_redemptions; used_count increments only after payment (webhook). */

type RpcResult = {
  ok: boolean
  code?: string
  type?: string
  value?: number
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const raw = typeof body?.code === 'string' ? body.code : ''
    const code = raw.trim().toUpperCase()
    if (!code) {
      return NextResponse.json({ error: 'Code is required.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('redeem_voucher', {
      p_code: code,
      p_user_id: user.id,
    })

    if (error) {
      console.error('POST /api/vouchers/redeem rpc', error)
      return NextResponse.json({ error: 'Could not redeem voucher.' }, { status: 500 })
    }

    const result = data as RpcResult | null
    if (!result || typeof result.ok !== 'boolean') {
      return NextResponse.json({ error: 'Invalid response from server.' }, { status: 500 })
    }

    if (!result.ok) {
      switch (result.code) {
        case 'not_found':
          return NextResponse.json({ error: 'Invalid code.' }, { status: 404 })
        case 'expired':
          return NextResponse.json({ error: 'This voucher has expired.' }, { status: 400 })
        case 'already_redeemed':
          return NextResponse.json({ error: 'You have already redeemed this voucher.' }, { status: 400 })
        case 'limit_reached':
          return NextResponse.json({ error: 'This voucher has reached its redemption limit.' }, { status: 400 })
        case 'inactive':
          return NextResponse.json({ error: 'This voucher is no longer active.' }, { status: 400 })
        default:
          return NextResponse.json({ error: 'This voucher cannot be redeemed.' }, { status: 400 })
      }
    }

    return NextResponse.json({
      success: true,
      voucher: {
        type: result.type,
        value: result.value,
      },
    })
  } catch (e) {
    console.error('POST /api/vouchers/redeem', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
