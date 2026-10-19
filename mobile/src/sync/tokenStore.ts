export interface TokenStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

export class MemoryTokenStore implements TokenStore {
  private readonly values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  async clear(): Promise<void> {
    this.values.clear()
  }
}

const STORAGE_PREFIX = 'klaro.auth.'
const INDEX_KEY = `${STORAGE_PREFIX}_index`

/** SecureStore keys are limited to alphanumerics, ".", "-", and "_". */
export function secureStorageKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${STORAGE_PREFIX}${safe}`
}

export function rememberTokenKey(index: string | null, key: string): string {
  const keys = new Set((index ?? '').split('\n').filter((item) => item.length > 0))
  keys.add(key)
  return [...keys].sort().join('\n')
}

export function forgetTokenKey(index: string | null, key: string): string {
  return (index ?? '')
    .split('\n')
    .filter((item) => item.length > 0 && item !== key)
    .join('\n')
}

export function tokenKeysFromIndex(index: string | null): string[] {
  return (index ?? '').split('\n').filter((item) => item.length > 0)
}

export const SECURE_TOKEN_INDEX_KEY = INDEX_KEY
