import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { KlaroRepository, type RepositoryOptions } from './repository'
import { schema } from './schema'

export function migrationDir(): string {
  return join(fileURLToPath(new URL('.', import.meta.url)), '../../drizzle')
}

export function applyMigrations(sqlite: Database.Database): void {
  const files = readdirSync(migrationDir())
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
  for (const file of files) {
    const sqlText = readFileSync(join(migrationDir(), file), 'utf8')
    const statements = sqlText
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
    for (const statement of statements) sqlite.exec(statement)
  }
}

export function openTestRepository(options?: Omit<RepositoryOptions, 'db'>) {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  return { sqlite, repo: new KlaroRepository({ db, ...options }) }
}
