import { TERMS_VERSION, PRIVACY_VERSION } from './legalVersions'

export type LegalConsentProfile = {
  terms_accepted_at?: string | null
  privacy_accepted_at?: string | null
  terms_version?: string | null
  privacy_version?: string | null
}

/**
 * Returns true if the user must re-accept Terms and Privacy before accessing the dashboard.
 * Used for server-side redirect and legal-update page guard.
 * Do NOT enforce when profile is null (e.g. trigger timing); only enforce when profile exists and consent is missing or outdated.
 */
export function needsLegalReconsent(profile: LegalConsentProfile | null): boolean {
  if (profile == null) return false
  if (profile.terms_accepted_at == null || profile.privacy_accepted_at == null) return true
  if (profile.terms_version !== TERMS_VERSION || profile.privacy_version !== PRIVACY_VERSION) return true
  return false
}
