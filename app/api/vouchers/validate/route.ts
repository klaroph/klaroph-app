import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** Validates voucher only — no voucher_redemptions row; consumption after payment (webhook). */

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

    const { data, error } = await supabaseAdmin.rpc('validate_voucher', {
      p_code: code,
    })

    if (error) {
      console.error('POST /api/vouchers/validate rpc', error)
      return NextResponse.json({ error: 'Could not validate voucher.' }, { status: 500 })
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
    console.error('POST /api/vouchers/validate', e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
