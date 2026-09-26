import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { listKlaroChatMessages } from '@/lib/ai/klaroChatService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/chat?conversationId=...
 * Load messages for an owned conversation (hydration only).
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')?.trim()
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'conversationId is required.' },
        { status: 400 }
      )
    }

    const messages = await listKlaroChatMessages({
      userId: user.id,
      conversationId,
    })

    if (!messages) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: true, conversationId, messages },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (e) {
    console.error('[klaro-chat] get_route_error', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json(
      { success: false, error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
