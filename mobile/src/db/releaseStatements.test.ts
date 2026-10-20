import { describe, expect, it } from 'vitest'
import { releasePreparedStatements } from './releaseStatements'

type WriteResult = { changes: number; lastInsertRowId: number }
type ReadResult = { getAllSync: () => unknown[]; getFirstSync: () => unknown }

function fakeSqlite() {
  let live = 0
  const sqlite = {
    prepareSync(_source: string) {
      live += 1
      const statement = {
        executeSync(): WriteResult & ReadResult {
          return {
            changes: 1,
            lastInsertRowId: live,
            getAllSync: () => [],
            getFirstSync: () => undefined,
          }
        },
        executeForRawResultSync(): ReadResult {
          return {
            getAllSync: () => [],
            getFirstSync: () => undefined,
          }
        },
        finalizeSync() {
          live -= 1
        },
      }
      return statement
    },
  }
  return { sqlite: releasePreparedStatements(sqlite), live: () => live }
}

describe('prepared statements', () => {
  it('finalizes a write as soon as the change count is read', () => {
    const db = fakeSqlite()
    const result = db.sqlite.prepareSync('insert').executeSync() as WriteResult
    expect(result.changes).toBe(1)
    expect(result.lastInsertRowId).toBe(1)
    expect(db.live()).toBe(0)
  })

  it('does not retain a statement per add across a synchronous burst', () => {
    const db = fakeSqlite()
    for (let index = 0; index < 300; index += 1) {
      const result = db.sqlite.prepareSync('insert').executeSync() as WriteResult
      expect(result.changes).toBe(1)
    }
    expect(db.live()).toBe(0)
  })

  it('finalizes a read after the rows are taken', () => {
    const db = fakeSqlite()
    const result = db.sqlite.prepareSync('select').executeSync() as ReadResult
    expect(result.getAllSync()).toEqual([])
    expect(db.live()).toBe(0)
    const raw = db.sqlite.prepareSync('select raw').executeForRawResultSync() as ReadResult
    expect(raw.getFirstSync()).toBeUndefined()
    expect(db.live()).toBe(0)
  })
})
