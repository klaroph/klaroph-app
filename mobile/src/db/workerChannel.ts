import { deserialize, serialize } from '../../node_modules/expo-sqlite/web/SyncSerializer'

const PENDING = 1
const RESOLVED = 2
const RESULT_BYTES = 1024 * 1024
/**
 * Upstream stops after 1e6 `Atomics.pause` calls, about 35ms. A warm OPFS
 * write can take longer than that and surface as "Sync operation timeout".
 */
const SYNC_PAUSE_LIMIT = 60_000_000

let messageId = 0
const deferredMap = new Map<number, Deferred<unknown>>()
let bridgeDepth = 0
const waiters: (() => void)[] = []

const lockBuffer = new SharedArrayBuffer(4)
const lock = new Int32Array(lockBuffer)
const resultBuffer = new SharedArrayBuffer(RESULT_BYTES)
const resultBytes = new Uint8Array(resultBuffer)
const resultLength = new Uint32Array(resultBuffer, 0, 1)

class Deferred<T> {
  private readonly promise: Promise<T>
  private resolveCallback: (value: T) => void = () => undefined
  private rejectCallback: (reason?: unknown) => void = () => undefined

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolveCallback = resolve
      this.rejectCallback = reject
    })
  }

  resolve(value: T): void {
    this.resolveCallback(value)
  }

  reject(reason?: unknown): void {
    this.rejectCallback(reason)
  }

  getPromise(): Promise<T> {
    return this.promise
  }
}

function releaseBridge(): void {
  bridgeDepth -= 1
  if (bridgeDepth > 0) return
  const next = waiters.shift()
  if (!next) return
  bridgeDepth = 1
  next()
}

function acquireAsync(): Promise<void> {
  if (bridgeDepth === 0) {
    bridgeDepth = 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      bridgeDepth = 1
      resolve()
    })
  })
}

/**
 * Worker writes the sync result into the shared buffer. Kept compatible with
 * the wa-sqlite worker that ships inside expo-sqlite.
 */
export function sendWorkerResult({
  id,
  result,
  error,
  syncTrait,
}: {
  id: number
  result: unknown
  error: Error | null
  syncTrait?: {
    lockBuffer: SharedArrayBuffer
    resultBuffer: SharedArrayBuffer
  }
}): void {
  const errorMessage = error != null ? error.message || String(error) : null
  if (syncTrait) {
    const workerLock = new Int32Array(syncTrait.lockBuffer)
    let encoded = new TextEncoder().encode(
      errorMessage != null ? serialize({ error: errorMessage }) : serialize({ result }),
    )
    if (encoded.length + 4 > syncTrait.resultBuffer.byteLength) {
      encoded = new TextEncoder().encode(
        serialize({
          error: `The synchronous result is ${encoded.length} bytes, which is more than the ${syncTrait.resultBuffer.byteLength - 4} bytes that synchronous calls can return on web. Use the async API for large results.`,
        }),
      )
    }
    new Uint32Array(syncTrait.resultBuffer, 0, 1)[0] = encoded.length
    new Uint8Array(syncTrait.resultBuffer).set(encoded, 4)
    Atomics.store(workerLock, 0, RESOLVED)
    return
  }
  if (error != null) {
    self.postMessage({ id, error: errorMessage })
    return
  }
  self.postMessage({ id, result })
}

export function workerMessageHandler(event: MessageEvent): void {
  const data = event.data as { id?: number; result?: unknown; error?: string; isSync?: boolean }
  if (data.isSync) return
  if (data.id == null) return
  const deferred = deferredMap.get(data.id)
  if (!deferred) return
  if (data.error) deferred.reject(new Error(data.error))
  else deferred.resolve(data.result)
  deferredMap.delete(data.id)
}

export async function invokeWorkerAsync(worker: Worker, type: string, data: unknown): Promise<unknown> {
  await acquireAsync()
  try {
    const id = messageId
    messageId += 1
    const deferred = new Deferred<unknown>()
    deferredMap.set(id, deferred)
    worker.postMessage({ type, id, data, isSync: false })
    return await deferred.getPromise()
  } finally {
    releaseBridge()
  }
}

/**
 * One reused result buffer for every sync call. Allocating a fresh 1MB
 * SharedArrayBuffer per statement is what exhausted the page after a large pull.
 * Calls run one at a time on this bridge.
 */
export function invokeWorkerSync(worker: Worker, type: string, data: unknown): unknown {
  if (bridgeDepth > 0) {
    throw new Error('SQLite bridge is busy.')
  }
  bridgeDepth = 1
  try {
    const id = messageId
    messageId += 1
    Atomics.store(lock, 0, PENDING)
    resultLength[0] = 0
    worker.postMessage({
      type,
      id,
      data,
      isSync: true,
      lockBuffer,
      resultBuffer,
    })

    const pause = (Atomics as { pause?: () => void }).pause
    let spins = 0
    while (Atomics.load(lock, 0) === PENDING) {
      spins += 1
      if (pause) {
        if (spins > SYNC_PAUSE_LIMIT) throw new Error('Sync operation timeout')
        pause()
      } else if (spins > 1_000_000_000) {
        throw new Error('Sync operation timeout')
      }
    }

    const length = resultLength[0] ?? 0
    const copy = new Uint8Array(length)
    copy.set(resultBytes.subarray(4, 4 + length))
    resultLength[0] = 0
    const decoded = new TextDecoder().decode(copy)
    const payload = deserialize<{ result: unknown; error?: string }>(decoded)
    if (payload.error) throw new Error(payload.error)
    return payload.result
  } finally {
    releaseBridge()
  }
}
