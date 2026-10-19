const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (!uuid) {
    throw new Error('crypto.randomUUID is unavailable')
  }
  return uuid
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
