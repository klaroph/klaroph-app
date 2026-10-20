import { eq } from 'drizzle-orm'
import type { KlaroDb } from '../db/repository'
import { localMeta } from '../db/schema'

const FIRST_RUN_KEY = 'ui.first_run_done'
const SYNC_ENABLED_KEY = 'ui.sync_enabled'

/**
 * Screen preferences in the existing `local_meta` table.
 * Sign-out already clears that table. Callers that should keep the intro
 * write the flag back after sign-out.
 */
export class ScreenPrefs {
  constructor(private readonly db: KlaroDb) {}

  firstRunDone(): boolean {
    return this.read(FIRST_RUN_KEY) === '1'
  }

  setFirstRunDone(done = true): void {
    this.write(FIRST_RUN_KEY, done ? '1' : null)
  }

  /** Missing key means sync is on. */
  syncEnabled(): boolean {
    return this.read(SYNC_ENABLED_KEY) !== '0'
  }

  setSyncEnabled(enabled: boolean): void {
    this.write(SYNC_ENABLED_KEY, enabled ? null : '0')
  }

  private read(key: string): string | null {
    return this.db.select().from(localMeta).where(eq(localMeta.key, key)).get()?.value ?? null
  }

  private write(key: string, value: string | null): void {
    if (value == null) {
      this.db.delete(localMeta).where(eq(localMeta.key, key)).run()
      return
    }
    this.db
      .insert(localMeta)
      .values({ key, value })
      .onConflictDoUpdate({ target: localMeta.key, set: { value } })
      .run()
  }
}
