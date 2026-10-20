type SyncResult = {
  changes?: number
  lastInsertRowId?: number
  getAllSync?: (...args: unknown[]) => unknown
  getFirstSync?: (...args: unknown[]) => unknown
}

type SyncStatement = {
  executeSync: (...args: unknown[]) => unknown
  executeForRawResultSync: (...args: unknown[]) => unknown
  finalizeSync: () => void
}

type PrepareSync = (source: string) => SyncStatement

/**
 * Drizzle's expo-sqlite session prepares a statement per query and never
 * finalizes it. A deferred finalize keeps every write statement alive until
 * the turn ends, so a burst of adds retains them all. Finalize as soon as the
 * caller reads the result.
 */
export function releasePreparedStatements<T extends { prepareSync: (source: string) => object }>(sqlite: T): T {
  const prepare = sqlite.prepareSync.bind(sqlite) as PrepareSync
  sqlite.prepareSync = ((source: string) => armStatement(prepare(source))) as T['prepareSync']
  return sqlite
}

function armStatement(statement: SyncStatement): SyncStatement {
  const executeSync = statement.executeSync.bind(statement)
  const executeRaw = statement.executeForRawResultSync.bind(statement)
  let finalized = false
  const finalize = () => {
    if (finalized) return
    finalized = true
    statement.finalizeSync()
  }
  const arm = (result: unknown) => {
    if (result && typeof result === 'object') {
      const record = result as SyncResult
      for (const name of ['getAllSync', 'getFirstSync'] as const) {
        const current = record[name]
        if (typeof current !== 'function') continue
        Object.defineProperty(result, name, {
          configurable: true,
          enumerable: true,
          value: (...inner: unknown[]) => {
            try {
              return current.apply(result, inner)
            } finally {
              finalize()
            }
          },
        })
      }
      if ('changes' in record || 'lastInsertRowId' in record) {
        const changes = record.changes
        const lastInsertRowId = record.lastInsertRowId
        const releaseOnRead = () => {
          finalize()
        }
        Object.defineProperty(result, 'changes', {
          configurable: true,
          enumerable: true,
          get() {
            releaseOnRead()
            return changes
          },
        })
        Object.defineProperty(result, 'lastInsertRowId', {
          configurable: true,
          enumerable: true,
          get() {
            releaseOnRead()
            return lastInsertRowId
          },
        })
      }
    }
    queueMicrotask(finalize)
    return result
  }
  statement.executeSync = (...args: unknown[]) => {
    try {
      return arm(executeSync(...args))
    } catch (error) {
      finalize()
      throw error
    }
  }
  statement.executeForRawResultSync = (...args: unknown[]) => {
    try {
      return arm(executeRaw(...args))
    } catch (error) {
      finalize()
      throw error
    }
  }
  return statement
}
