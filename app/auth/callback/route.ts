import { createServerClient } from '@supabase/ssr'
import { serialize } from 'cookie'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { TERMS_VERSION, PRIVACY_VERSION } from '@/lib/legalVersions'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendWelcomeEmail } from '@/lib/welcomeEmail'

/**
 * Resolve redirect base URL. Production (VERCEL_ENV=production) must use NEXT_PUBLIC_APP_URL.
 * Preview and development use request host + protocol (https for preview, http for localhost).
 */
function getRedirectBase(request: Request): string {
  if (process.env.VERCEL_ENV === 'production') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl?.trim()) {
      throw new Error('NEXT_PUBLIC_APP_URL is required for OAuth redirect safety.')
    }
    return appUrl.replace(/\/$/, '')
  }
  const host = request.headers.get('host') ?? new URL(request.url).host
  const protocol = host === 'localhost' || host.startsWith('localhost:') ? 'http' : 'https'
  return `${protocol}://${host}`
}

type ProfileRow = {
  terms_accepted_at: string | null
  privacy_accepted_at: string | null
  terms_version: string | null
  privacy_version: string | null
  full_name: string | null
  welcome_email_sent_at: string | null
}

export async function GET(request: Request) {
  const baseUrl = getRedirectBase(request)
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (process.env.NODE_ENV === 'development') {
    console.log('Callback hit on:', request.url)
    console.log('Resolved redirect base:', baseUrl)
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', baseUrl))
  }

  const cookieStore = await cookies()

  const response = NextResponse.redirect(new URL('/dashboard', baseUrl))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts = {
              ...(options ?? {}),
              path: '/',
              httpOnly: false,
              sameSite: 'lax' as const,
              secure: process.env.NODE_ENV === 'production',
            }
            response.headers.append('set-cookie', serialize(name, value, opts))
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('OAuth error:', error.message)
    return NextResponse.redirect(new URL('/login', baseUrl))
  }

  if (data?.session?.user?.id) {
    const userId = data.session.user.id
    // Use admin client so we're not subject to RLS/session timing; profile may have just been created by trigger.
    let profile: ProfileRow | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: row } = await supabaseAdmin
        .from('profiles')
        .select('terms_accepted_at, privacy_accepted_at, terms_version, privacy_version, full_name, welcome_email_sent_at')
        .eq('id', userId)
        .single()
      if (row) {
        profile = row as ProfileRow
        break
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250))
    }

    const now = new Date().toISOString()
    const update = {
      terms_accepted_at: profile?.terms_accepted_at ?? now,
      privacy_accepted_at: profile?.privacy_accepted_at ?? now,
      terms_version: profile?.terms_version ?? TERMS_VERSION,
      privacy_version: profile?.privacy_version ?? PRIVACY_VERSION,
    }
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', userId)

    if (updateError && process.env.NODE_ENV === 'development') {
      console.error('Callback consent update failed:', updateError.message)
    }

    // Welcome email: send at most once per user. Failure must never block redirect.
    if (profile && profile.welcome_email_sent_at == null && data.session.user.email) {
      try {
        const fullName = (profile?.full_name ?? data.session.user.user_metadata?.full_name ?? null) as string | null
        const sent = await sendWelcomeEmail(
          data.session.user.email,
          fullName,
          baseUrl
        )
        if (sent) {
          await supabaseAdmin
            .from('profiles')
            .update({ welcome_email_sent_at: now })
            .eq('id', userId)
        }
      } catch {
        // Silent; redirect proceeds
      }
    }
  }

  if (process.env.NODE_ENV === 'development' && data?.session?.user?.id) {
    console.log('Callback session.user.id:', data.session.user.id)
  }

  return response
}