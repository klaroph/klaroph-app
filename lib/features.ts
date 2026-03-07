import type { UserFeaturesWithSubscription } from '@/types/features'

/**
 * Fetch current user's feature set + subscription state from backend.
 * Single source for premium UI; do not duplicate subscription queries.
 * API responds with Cache-Control: no-store so responses are not cached.
 */
export async function fetchUserFeatures(): Promise<UserFeaturesWithSubscription | null> {
  const res = await fetch('/api/features', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return data as UserFeaturesWithSubscription
}
