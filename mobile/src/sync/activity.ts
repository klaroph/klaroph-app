export type SyncActivity = 'idle' | 'syncing'

let depth = 0
let activity: SyncActivity = 'idle'
const listeners = new Set<(activity: SyncActivity) => void>()

export function syncActivity(): SyncActivity {
  return activity
}

export function subscribeSyncActivity(listener: (activity: SyncActivity) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish(): void {
  const next: SyncActivity = depth > 0 ? 'syncing' : 'idle'
  if (next === activity) return
  activity = next
  for (const listener of listeners) listener(activity)
}

/** Yields so React can paint before the next synchronous SQLite batch. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * Marks every pull syncing before `work` starts. The outermost pull yields
 * once so the syncing pill can paint, then clears the flag when the pull ends.
 * Nested pulls keep the flag set.
 */
export async function runPull<T>(work: () => Promise<T>): Promise<T> {
  const outer = depth === 0
  depth += 1
  publish()
  try {
    if (outer) await yieldToUi()
    return await work()
  } finally {
    depth -= 1
    publish()
  }
}
