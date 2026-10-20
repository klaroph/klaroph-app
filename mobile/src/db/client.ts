import { openDatabaseSync } from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'
import { schema } from './schema'

export const DATABASE_NAME = 'klaro.db'

const sqlite = openDatabaseSync(DATABASE_NAME)
sqlite.execSync('PRAGMA foreign_keys = ON')

export const klaroDb = drizzle(sqlite, { schema })

/** Native opens above, at import. Web uses `client.web.ts`, which waits for the worker. */
export function loadKlaroDatabase(): Promise<typeof klaroDb> {
  return Promise.resolve(klaroDb)
}
