import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { needsLegalReconsent } from '@/lib/legalConsent'
import LegalUpdateForm from './LegalUpdateForm'
import LegalUpdateReload from './LegalUpdateReload'

export const metadata = {
  title: 'Legal update required — KlaroPH',
  description: 'Please accept the updated Terms and Privacy Policy to continue.',
}

type PageProps = { searchParams?: Promise<{ r?: string }> | { r?: string } }

export default async function LegalUpdatePage(props: PageProps) {
  const searchParams = props.searchParams ?? {}
  const resolved = await (Promise.resolve(searchParams) as Promise<{ r?: string }>)
  const needsReload = resolved?.r === '1'

  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_accepted_at, privacy_accepted_at, terms_version, privacy_version')
    .eq('id', session.user.id)
    .single()

  if (!needsLegalReconsent(profile ?? null)) {
    redirect('/dashboard')
  }

  // After OAuth redirect, dashboard sends ?r=1 to force a full page load so this page renders.
  if (needsReload) {
    return <LegalUpdateReload />
  }

  return <LegalUpdateForm />
}
