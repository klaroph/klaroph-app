export type PullSnapshot = {
  dirty: boolean
  deleted_at: string | null
  base_updated_at: string | null
}

export type PullDecision = 'apply-remote' | 'keep-local'

/**
 * Delete wins over an edit. Otherwise the server `updated_at` wins when it is
 * newer than the version this device edited; an unpushed local edit wins when
 * the pulled row is that same version (overlap redelivery) or older.
 */
export function decidePull(
  local: PullSnapshot | null,
  remote: { deleted_at: string | null; updated_at: string },
): PullDecision {
  if (!local) return 'apply-remote'
  if (local.deleted_at && (local.dirty || !remote.deleted_at)) return 'keep-local'
  if (remote.deleted_at) return 'apply-remote'
  if (!local.dirty) return 'apply-remote'
  if (local.base_updated_at == null) return 'keep-local'
  if (Date.parse(remote.updated_at) > Date.parse(local.base_updated_at)) return 'apply-remote'
  return 'keep-local'
}
