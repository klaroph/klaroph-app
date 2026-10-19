import { NextResponse } from 'next/server'

/** Retired with the founder voucher. Does not look up or redeem a code. */
export async function POST(request: Request) {
  await request.text()
  return NextResponse.json({ error: 'Promo codes are no longer accepted.' }, { status: 410 })
}
