import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { askKlaro } from '@/lib/ai/klaroChatService'
import { BANNED_AI_CHAT_BODY_KEYS } from '@/lib/ai/bannedChatBodyKeys'

export const dynamic = 'force-dynamic'

type Body = {
  message?: unknown
  conversationId?: unknown
  period?: unknown
}

/**
 * POST /api/ai/chat
 * Authenticated Ask Klaro turn. Server builds financial context — client sends message only.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let body: Body = {}
    try {
      body = (await request.json()) as Body
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request.' },
        { status: 400 }
      )
    }

    const record = body as Record<string, unknown>
    for (const key of BANNED_AI_CHAT_BODY_KEYS) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return NextResponse.json(
          { success: false, error: 'Invalid request.' },
          { status: 400 }
        )
      }
    }

    const conversationId =
      typeof body.conversationId === 'string' && body.conversationId.trim()
        ? body.conversationId.trim()
        : null

    const result = await askKlaro({
      userId: user.id,
      supabase,
      message: body.message,
      conversationId,
      periodInput: typeof body.period === 'string' ? body.period : undefined,
    })

    if (!result.success) {
      const status =
        result.code === 'unauthorized'
          ? 401
          : result.code === 'validation'
            ? 400
            : result.code === 'forbidden'
              ? 403
              : result.code === 'cooldown' || result.code === 'rate_limited'
                ? 429
                : 500
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          code: result.code,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        {
          status,
          headers:
            result.retryAfterSeconds != null
              ? { 'Retry-After': String(result.retryAfterSeconds) }
              : undefined,
        }
      )
    }

    return NextResponse.json(
      {
        success: true,
        conversationId: result.conversationId,
        message: result.message,
        source: result.source,
        dailyRemaining: result.dailyRemaining,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  } catch (e) {
    console.error('[klaro-chat] route_error', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json(
      { success: false, error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
