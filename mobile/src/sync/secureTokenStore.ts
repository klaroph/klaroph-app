import * as SecureStore from 'expo-secure-store'
import {
  forgetTokenKey,
  rememberTokenKey,
  SECURE_TOKEN_INDEX_KEY,
  secureStorageKey,
  tokenKeysFromIndex,
  type TokenStore,
} from './tokenStore'

/**
 * Production token store. Sign-out calls `clear()`, which deletes every key
 * recorded in the index. Tests use MemoryTokenStore so they do not need the
 * native module.
 */
export function createSecureTokenStore(): TokenStore {
  return {
    async get(key) {
      return SecureStore.getItemAsync(secureStorageKey(key))
    },
    async set(key, value) {
      await SecureStore.setItemAsync(secureStorageKey(key), value)
      const index = await SecureStore.getItemAsync(SECURE_TOKEN_INDEX_KEY)
      await SecureStore.setItemAsync(SECURE_TOKEN_INDEX_KEY, rememberTokenKey(index, key))
    },
    async remove(key) {
      await SecureStore.deleteItemAsync(secureStorageKey(key))
      const index = await SecureStore.getItemAsync(SECURE_TOKEN_INDEX_KEY)
      const next = forgetTokenKey(index, key)
      if (next) await SecureStore.setItemAsync(SECURE_TOKEN_INDEX_KEY, next)
      else await SecureStore.deleteItemAsync(SECURE_TOKEN_INDEX_KEY)
    },
    async clear() {
      const index = await SecureStore.getItemAsync(SECURE_TOKEN_INDEX_KEY)
      for (const key of tokenKeysFromIndex(index)) {
        await SecureStore.deleteItemAsync(secureStorageKey(key))
      }
      await SecureStore.deleteItemAsync(SECURE_TOKEN_INDEX_KEY)
    },
  }
}
