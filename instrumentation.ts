/**
 * Runs once when the Next.js server starts. In production, validates required env vars;
 * if any are missing, throws so the app does not start.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return

  // Required for auth and OAuth; do not allow silent misconfig.
  const requiredPublic = [
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ] as const
  for (const key of requiredPublic) {
    if (!process.env[key]?.trim()) {
      throw new Error(`${key} is required. Set it in .env.local or your deployment.`)
    }
  }

  if (process.env.NODE_ENV !== 'production') return

  const required: { key: string; label: string }[] = [
    { key: 'NEXT_PUBLIC_APP_URL', label: 'App URL (OAuth redirect base)' },
    { key: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL' },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon key' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase service role key (webhook)' },
    { key: 'PAYMONGO_SECRET_KEY', label: 'PayMongo secret key' },
    { key: 'PAYMONGO_WEBHOOK_SECRET', label: 'PayMongo webhook secret' },
  ]

  const missing = required.filter(({ key }) => !process.env[key]?.trim())
  if (missing.length > 0) {
    const list = missing.map((m) => m.key).join(', ')
    throw new Error(
      `Missing required environment variables: ${list}. Set them in .env.local or your deployment.`
    )
  }
}
