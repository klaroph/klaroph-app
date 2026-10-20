import { KlaroRepository, type KlaroDb } from '../db/repository'
import { runPull } from '../sync/activity'
import { SyncEngine, type SyncReport } from '../sync/engine'
import { createSecureTokenStore } from '../sync/secureTokenStore'
import { createKlaroSupabase, createSupabaseRemote, tokenStoreStorage } from '../sync/supabaseRemote'
import { signInAndAdopt, signOutKeepingIntro, type SignInResult } from '../ui/accountFlow'
import { MISSING_SUPABASE_CONFIG } from '../ui/copy'
import { ScreenPrefs } from '../ui/prefs'
import { readPublicSupabaseConfig } from '../ui/publicConfig'
import { restoreSupabaseSession, supabasePasswordSignIn } from './supabaseAuth'

export type AppRuntime = {
  repo: KlaroRepository
  prefs: ScreenPrefs
  configured: boolean
  signIn(email: string, password: string): Promise<SignInResult>
  signOut(): Promise<void>
  sync(): Promise<SyncReport | null>
}

export function createAppRuntime(db: KlaroDb): AppRuntime {
  const repo = new KlaroRepository({ db })
  const prefs = new ScreenPrefs(db)
  const tokens = createSecureTokenStore()
  const config = readPublicSupabaseConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  })
  const client = config ? createKlaroSupabase(config.url, config.anonKey, tokenStoreStorage(tokens)) : null
  const engine = client ? new SyncEngine(repo, createSupabaseRemote(client)) : null

  return {
    repo,
    prefs,
    configured: client != null && engine != null,
    async signIn(email, password) {
      if (!client || !config || !engine) throw new Error(MISSING_SUPABASE_CONFIG)
      const session = await supabasePasswordSignIn(client, config.url, email, password)
      try {
        return await signInAndAdopt({
          local: repo,
          tokens,
          userId: session.userId,
          tokenKey: session.tokenKey,
          tokenValue: session.tokenValue,
          engine,
          syncEnabled: prefs.syncEnabled(),
        })
      } finally {
        await restoreSupabaseSession(client, session.accessToken, session.refreshToken).catch(() => undefined)
      }
    },
    async signOut() {
      const restoreIntro = prefs.firstRunDone()
      const kept = prefs.exportKeptPrefs()
      if (client) await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
      await signOutKeepingIntro({
        local: repo,
        tokens,
        restoreIntro,
        markIntroDone: () => prefs.setFirstRunDone(true),
      })
      prefs.restoreKeptPrefs(kept)
    },
    sync() {
      const userId = repo.sessionUserId()
      if (!userId || !engine) return Promise.resolve(null)
      return runPull(() => engine.sync(userId))
    },
  }
}
