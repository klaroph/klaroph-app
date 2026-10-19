import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import OnboardingFlow from './OnboardingFlow'

function metadataFullName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const fullName = (metadata as { full_name?: unknown }).full_name
  return typeof fullName === 'string' ? fullName : null
}

export const metadata = {
  title: 'Get started — KlaroPH',
  description: 'Complete your profile to get the most out of KlaroPH.',
}

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, full_name, nickname')
    .eq('id', session.user.id)
    .single()

  if (profile?.onboarding_completed === true) {
    redirect('/dashboard')
  }

  const profileName = profile?.full_name ?? null
  const googleName = metadataFullName(session.user.user_metadata)
  const fullName =
    profileName && profileName.trim() && !profileName.includes('@') ? profileName : googleName

  return (
    <div className="onboarding-page">
      <OnboardingFlow nickname={profile?.nickname ?? null} fullName={fullName} />
    </div>
  )
}
