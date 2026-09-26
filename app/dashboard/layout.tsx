import { redirect } from 'next/navigation'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { needsLegalReconsent } from '@/lib/legalConsent'
import DashboardLayoutClient from './DashboardLayoutClient'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  // Auth server unreachable while refreshing: keep the session and offer a retry instead of the login page.
  if (!session && error && isAuthRetryableFetchError(error)) {
    return (
      <main style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Can&apos;t reach KlaroPH right now</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Check your connection and try again. You&apos;re still signed in.
        </p>
        <a href="/dashboard" className="btn-primary">Try again</a>
      </main>
    )
  }
  if (!session?.user) {
    redirect('/')
  }

  const userId = session.user.id

  // Step 1: Ensure profile row exists after OAuth (never assume trigger created it).
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (!existingProfile) {
    await supabaseAdmin.from('profiles').insert({
      id: userId,
      full_name: session.user.user_metadata?.full_name ?? session.user.email ?? '',
      created_at: new Date().toISOString(),
      onboarding_completed: false,
      clarity_level: 0,
      streak_days: 0,
    })
  }

  // Step 2: Load profile (use admin so we see the row we may have just created) and only hard-block if consent is missing/outdated.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('terms_accepted_at, privacy_accepted_at, terms_version, privacy_version, onboarding_completed')
    .eq('id', userId)
    .single()

  if (profile != null && needsLegalReconsent(profile)) {
    // Force full page load so the consent page renders (avoids client nav / stale RSC).
    redirect('/legal-update?r=1')
  }

  if (profile?.onboarding_completed === false) {
    redirect('/onboarding')
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>
}
