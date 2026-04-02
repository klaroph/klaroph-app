import { createBrowserClient } from '@supabase/ssr'
import { parse, serialize, type CookieSerializeOptions } from 'cookie'
import { authSessionIsPersistent } from '@/lib/authSessionScope'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (process.env.NODE_ENV !== 'production') {
  console.log('SUPABASE URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error(
    'Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  )
}

function browserCookiesGetAll(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return []
  const parsed = parse(document.cookie)
  return Object.keys(parsed).map((name) => ({ name, value: parsed[name] ?? '' }))
}

function mergeCookieOptions(options: CookieSerializeOptions | undefined): CookieSerializeOptions {
  return { path: '/', sameSite: 'lax', ...options }
}

function finalizeCookieOptions(
  merged: CookieSerializeOptions,
  persistent: boolean,
  clearing: boolean
): CookieSerializeOptions {
  if (clearing) {
    return { ...merged, maxAge: 0 }
  }
  if (!persistent) {
    const next: CookieSerializeOptions = { ...merged }
    delete next.maxAge
    delete next.expires
    return next
  }
  return merged
}

function browserCookiesSetAll(
  cookiesToSet: { name: string; value: string; options: CookieSerializeOptions }[]
): void {
  if (typeof document === 'undefined') return
  const persistent = authSessionIsPersistent()
  for (const { name, value, options } of cookiesToSet) {
    const clearing = value === '' || value == null
    const merged = mergeCookieOptions(options)
    const opts = finalizeCookieOptions(merged, persistent, clearing)
    document.cookie = serialize(name, value ?? '', opts)
  }
}

export const supabase = createBrowserClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  cookies: {
    getAll: () => browserCookiesGetAll(),
    setAll: (cookiesToSet) => {
      browserCookiesSetAll(cookiesToSet)
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
