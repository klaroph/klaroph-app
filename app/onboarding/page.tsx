import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import OnboardingFlow from './OnboardingFlow'

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
    .select('onboarding_completed')
    .eq('id', session.user.id)
    .single()

  if (profile?.onboarding_completed === true) {
    redirect('/dashboard')
  }

  return (
    <div className="onboarding-page">
      <OnboardingFlow />
    </div>
  )
}
