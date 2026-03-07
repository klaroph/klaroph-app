import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { ProfileWithComputed } from '@/types/profile'

const PROFILE_SELECT =
  'id, full_name, onboarding_completed, nickname, avatar_url, monthly_income_range, primary_goal_category, financial_stage, savings_confidence, risk_comfort, motivation_type, dream_statement, streak_days, clarity_level, badges_json, updated_at'

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [
      { data: profileRow, error: profileError },
      { data: completion, error: completionError },
      { data: clarity, error: clarityError },
    ] = await Promise.all([
      supabase.from('profiles').select(PROFILE_SELECT).eq('id', user.id).single(),
      supabase.rpc('get_profile_completion_percentage', { p_user_id: user.id }),
      supabase.rpc('get_clarity_level', { p_user_id: user.id }),
    ])

    if (profileError && profileError.code !== 'PGRST116') {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    // Safety: if trigger missed (e.g. legacy user or race), create profile once then continue.
    let resolvedProfileRow = profileRow
    let profile_completion_percentage = typeof completion === 'number' ? completion : 0
    let clarity_level = typeof clarity === 'number' ? clarity : 1

    if (!resolvedProfileRow) {
      await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: user.id,
            full_name: user.user_metadata?.full_name ?? user.email ?? null,
            onboarding_completed: false,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        )
      const { data: inserted } = await supabaseAdmin
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', user.id)
        .single()
      resolvedProfileRow = inserted ?? null
      // Re-run RPCs now that profile exists (they may have failed before).
      if (resolvedProfileRow) {
        const [c, cl] = await Promise.all([
          supabase.rpc('get_profile_completion_percentage', { p_user_id: user.id }),
          supabase.rpc('get_clarity_level', { p_user_id: user.id }),
        ])
        profile_completion_percentage = typeof c.data === 'number' ? c.data : 0
        clarity_level = typeof cl.data === 'number' ? cl.data : 1
      }
    }

    if (completionError || clarityError) {
      return NextResponse.json(
        { error: 'Could not compute profile metrics.' },
        { status: 500 }
      )
    }

    const profile = resolvedProfileRow ?? null

    const payload: ProfileWithComputed = {
      profile: profile
        ? {
            id: profile.id,
            full_name: profile.full_name ?? null,
            onboarding_completed: Boolean(profile.onboarding_completed),
            nickname: profile.nickname ?? null,
            avatar_url: profile.avatar_url ?? null,
            monthly_income_range: profile.monthly_income_range ?? null,
            primary_goal_category: profile.primary_goal_category ?? null,
            financial_stage: profile.financial_stage ?? null,
            savings_confidence: profile.savings_confidence ?? null,
            risk_comfort: profile.risk_comfort ?? null,
            motivation_type: profile.motivation_type ?? null,
            dream_statement: profile.dream_statement ?? null,
            streak_days: profile.streak_days ?? 0,
            clarity_level: clarity_level,
            badges_json: profile.badges_json ?? [],
            updated_at: profile.updated_at ?? null,
          }
        : {
            id: user.id,
            full_name: user.user_metadata?.full_name ?? null,
            onboarding_completed: false,
            nickname: null,
            avatar_url: null,
            monthly_income_range: null,
            primary_goal_category: null,
            financial_stage: null,
            savings_confidence: null,
            risk_comfort: null,
            motivation_type: null,
            dream_statement: null,
            streak_days: 0,
            clarity_level: 1,
            badges_json: [],
            updated_at: null,
          },
      profile_completion_percentage,
      clarity_level,
    }
    payload.profile.clarity_level = clarity_level

    return NextResponse.json(payload)
  } catch (e) {
    console.error('GET /api/profile', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const allowed = [
      'nickname',
      'avatar_url',
      'monthly_income_range',
      'primary_goal_category',
      'financial_stage',
      'savings_confidence',
      'risk_comfort',
      'motivation_type',
      'dream_statement',
    ] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) {
        const v = body[key]
        if (key === 'savings_confidence') {
          const n = Number(v)
          if (!Number.isNaN(n) && n >= 1 && n <= 5) updates[key] = n
        } else if (typeof v === 'string' || v === null) {
          updates[key] = v
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select(PROFILE_SELECT)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const [{ data: completion }, { data: clarity }] = await Promise.all([
      supabase.rpc('get_profile_completion_percentage', { p_user_id: user.id }),
      supabase.rpc('get_clarity_level', { p_user_id: user.id }),
    ])

    const profile_completion_percentage = typeof completion === 'number' ? completion : 0
    const clarity_level = typeof clarity === 'number' ? clarity : 1

    return NextResponse.json({
      profile: { ...data, clarity_level },
      profile_completion_percentage,
      clarity_level,
    })
  } catch (e) {
    console.error('PATCH /api/profile', e)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}
