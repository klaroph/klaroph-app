export type PublicSupabaseConfig = {
  url: string
  anonKey: string
}

/** Publishable Expo env only. This does not read env files. */
export function readPublicSupabaseConfig(env: Record<string, string | undefined>): PublicSupabaseConfig | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
}
