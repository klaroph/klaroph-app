/**
 * Tracks whether the current browser auth session should use persistent cookies
 * (Remember me) or session cookies (cleared when the browser closes).
 * Supabase session tokens live in cookies only — passwords are never stored.
 */

const SCOPE_KEY = 'klaroph_auth_session_scope'
const REMEMBER_PREF_KEY = 'klaroph_remember_me_pref'

export const BROWSER_SESSION_SCOPE = 'browser'
export const PERSISTENT_SESSION_SCOPE = 'persistent'

/** Call immediately before signInWithPassword so the next cookie writes use the right lifetime. */
export function setAuthSessionScopeForLogin(rememberMe: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (rememberMe) {
      sessionStorage.removeItem(SCOPE_KEY)
      localStorage.setItem(SCOPE_KEY, PERSISTENT_SESSION_SCOPE)
    } else {
      localStorage.removeItem(SCOPE_KEY)
      sessionStorage.setItem(SCOPE_KEY, BROWSER_SESSION_SCOPE)
    }
  } catch {
    // storage blocked (private mode) — cookies still attempt to apply
  }
}

/** Remember-me checkbox default for returning visitors (UI only). */
export function persistRememberMePreference(rememberMe: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REMEMBER_PREF_KEY, rememberMe ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(REMEMBER_PREF_KEY) === '1'
  } catch {
    return false
  }
}

/** Used when writing auth cookies: session-only vs long-lived. */
export function authSessionIsPersistent(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (sessionStorage.getItem(SCOPE_KEY) === BROWSER_SESSION_SCOPE) return false
    if (localStorage.getItem(SCOPE_KEY) === PERSISTENT_SESSION_SCOPE) return true
  } catch {
    return true
  }
  // No scope yet (legacy session or before first scoped login): keep default long-lived refresh behavior
  return true
}

/** Clear scope flags and any Supabase browser storage keys on this origin. */
export function clearAuthSessionScope(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SCOPE_KEY)
    localStorage.removeItem(SCOPE_KEY)
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('sb-')) lsKeys.push(k)
    }
    lsKeys.forEach((k) => localStorage.removeItem(k))
    const ssKeys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith('sb-')) ssKeys.push(k)
    }
    ssKeys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
