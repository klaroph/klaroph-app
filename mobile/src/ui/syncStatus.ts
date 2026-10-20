export type SyncPillTone = 'local' | 'off' | 'syncing' | 'offline' | 'pending' | 'synced'

export type SyncPill = {
  tone: SyncPillTone
  label: string
}

export function syncPill(input: {
  signedIn: boolean
  syncEnabled: boolean
  syncing: boolean
  offline: boolean
  pending: boolean
}): SyncPill {
  if (!input.signedIn) return { tone: 'local', label: 'On this phone' }
  if (!input.syncEnabled) return { tone: 'off', label: 'Sync off' }
  if (input.syncing) return { tone: 'syncing', label: 'Syncing' }
  if (input.offline) return { tone: 'offline', label: 'Offline' }
  if (input.pending) return { tone: 'pending', label: 'Not synced' }
  return { tone: 'synced', label: 'Synced' }
}

export function reportLooksOffline(report: { errors: readonly { message: string }[] }): boolean {
  return report.errors.some((error) => /network|fetch|offline|timeout|internet|failed to connect/i.test(error.message))
}

export function syncNotices(report: { errors: readonly { message: string }[]; summary: readonly string[] }): string[] {
  const lines = [...report.summary]
  for (const error of report.errors) {
    if (!lines.includes(error.message)) lines.push(error.message)
  }
  return lines
}

export function uniqueLines(lines: readonly string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter((line) => line.length > 0))]
}
