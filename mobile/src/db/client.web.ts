import { configureWeb, openDatabaseAsync } from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'
import wasmAsset from '../../node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm'
import { releasePreparedStatements } from './releaseStatements'
import type { KlaroDb } from './repository'
import { schema } from './schema'

export const DATABASE_NAME = 'klaro.db'

/**
 * Web stand-in so native screens can keep importing `klaroDb`.
 * The running database comes from `loadKlaroDatabase`.
 */
export const klaroDb = null as unknown as KlaroDb

let opening: Promise<KlaroDb> | null = null

/**
 * Opens OPFS SQLite on the web worker. The sync API spins on the main thread,
 * and this browser does not start that worker until the thread yields, so the
 * first open is async. Later sync queries run against the worker that is already up.
 * Native keeps `openDatabaseSync` in `client.ts`.
 */
export function loadKlaroDatabase(): Promise<KlaroDb> {
  opening ??= openWebDatabase()
  return opening
}

async function openWebDatabase(): Promise<KlaroDb> {
  const origin = typeof location === 'undefined' ? '' : location.origin
  const wasmURL = wasmAsset.startsWith('/') && origin ? new URL(wasmAsset, origin).href : wasmAsset
  configureWeb({ wasmURL })
  const sqlite = releasePreparedStatements(await openDatabaseAsync(DATABASE_NAME))
  sqlite.execSync('PRAGMA foreign_keys = ON')
  return drizzle(sqlite, { schema }) as unknown as KlaroDb
}
