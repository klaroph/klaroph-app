import { supabase } from '@/lib/supabaseClient'

/** `local` ends only this device's session; `global` revokes every session for the user. */
export type SignOutScope = 'local' | 'global'

function clearSupabaseBrowserStorage(): void {
  if (typeof window === 'undefined') return
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i)
        if (k?.startsWith('sb-')) keys.push(k)
      }
      keys.forEach((k) => storage.removeItem(k))
    }
  } catch {
    /* storage blocked */
  }
}

/** Ends the Supabase session (cookies) and clears any sb-* browser storage keys on this origin. */
export async function signOutWithFullCleanup(scope: SignOutScope): Promise<void> {
  await supabase.auth.signOut({ scope })
  clearSupabaseBrowserStorage()
}
