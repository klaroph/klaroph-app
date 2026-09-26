import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getKlaroInsight } from '@/lib/ai/klaroInsightService'
import { BANNED_AI_INSIGHT_BODY_KEYS } from '@/lib/ai/bannedInsightBodyKeys'

export const dynamic = 'force-dynamic'

type Body = {
  period?: string
  forceRefresh?: boolean
}

export { BANNED_AI_INSIGHT_BODY_KEYS }

/**
 * POST /api/ai/insight
 * Authenticated. Server builds financial context — client must not supply totals.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 })
    }

    let body: Body = {}
    try {
      body = (await request.json()) as Body
    } catch {
      body = {}
    }

    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>
      for (const key of BANNED_AI_INSIGHT_BODY_KEYS) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
          return NextResponse.json(
            { success: false, error: 'Invalid request.' },
            { status: 400 }
          )
        }
      }
    }

    // Identity exclusively from session — never from body
    const result = await getKlaroInsight({
      userId: user.id,
      supabase,
      periodInput: typeof body.period === 'string' ? body.period : undefined,
      forceRefresh: body.forceRefresh === true,
    })

    if (!result.success) {
      const status =
        result.code === 'cooldown' || result.code === 'rate_limited' ? 429 : 500
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
        insight: result.insight,
        source: result.source,
        cached: result.cached,
        period: result.period,
        dailyRemaining: result.dailyRemaining,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  } catch (e) {
    console.error('[klaro-ai] route_error', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json(
      { success: false, error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
