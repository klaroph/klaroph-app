import { NextResponse } from 'next/server'

/** Retired. QR Ph is the only checkout. This route creates no PayMongo session. */
export async function POST(request: Request) {
  await request.text()
  return NextResponse.json({ error: 'Checkout is no longer available.' }, { status: 410 })
}
