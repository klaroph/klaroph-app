import { openDatabaseSync } from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'
import { schema } from './schema'

export const DATABASE_NAME = 'klaro.db'

const sqlite = openDatabaseSync(DATABASE_NAME)
sqlite.execSync('PRAGMA foreign_keys = ON')

export const klaroDb = drizzle(sqlite, { schema })
