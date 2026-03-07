import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MESSAGE_MAX_LENGTH = 1000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

const recentByUserId = new Map<string, number[]>()
function cleanupAndCheckRateLimit(userId: string): boolean {
  const now = Date.now()
  const cut = now - RATE_LIMIT_WINDOW_MS
  let times = recentByUserId.get(userId) ?? []
  times = times.filter((t) => t > cut)
  if (times.length >= RATE_LIMIT_MAX) return false
  times.push(now)
  recentByUserId.set(userId, times)
  return true
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

    if (!cleanupAndCheckRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429 }
      )
    }

    let body: { message?: string; subject?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const message =
      typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }
    if (message.length > MESSAGE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Message must be at most ${MESSAGE_MAX_LENGTH} characters` },
        { status: 400 }
      )
    }

    const subject =
      typeof body.subject === 'string' ? body.subject.trim().slice(0, 500) : null

    const { error } = await supabaseAdmin.from('support_requests').insert({
      user_id: user.id,
      email: user.email ?? null,
      subject: subject || null,
      message,
      status: 'open',
    })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to save your request' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
