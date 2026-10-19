/**
 * Safe product name. A full email is never returned.
 *
 * Nickname (trimmed) when it is a real name; otherwise full name when the
 * whole value contains no "@"; otherwise the part of the email before "@";
 * otherwise fallback.
 *
 * A real name matches getFirstName (lib/email/campaignTemplate.ts): trimmed,
 * contains a letter, and contains no "@". Greeting sites pass firstName so a
 * full name contributes only its first word, still capped at 40 characters.
 * A set nickname is kept whole — that is already what we call the person,
 * even when it is longer than the edit cap. The cap applies the next time
 * they save a nickname, not when a stored name is shown.
 */

/**
 * Characters a new nickname may use.
 * Count is UTF-16 code units, the same count as an input's maxLength.
 */
export const NICKNAME_MAX_LENGTH = 15

/** Greeting first-word cap. Not the nickname edit cap. */
const GREETING_NAME_MAX_LENGTH = 40

export const NICKNAME_REQUIRED_ERROR = 'Enter what we should call you.'
export const NICKNAME_TOO_LONG_ERROR = `Use ${NICKNAME_MAX_LENGTH} characters or fewer.`

export type NicknameWrite =
  | { ok: true; nickname: string }
  | { ok: false; error: string }

/** Trimmed nickname ready to store. Rejects empty and over-long values. Does not truncate. */
export function nicknameForWrite(value: unknown): NicknameWrite {
  if (typeof value !== 'string') return { ok: false, error: NICKNAME_REQUIRED_ERROR }
  const nickname = value.trim()
  if (!nickname) return { ok: false, error: NICKNAME_REQUIRED_ERROR }
  if (nickname.length > NICKNAME_MAX_LENGTH) return { ok: false, error: NICKNAME_TOO_LONG_ERROR }
  return { ok: true, nickname }
}

/**
 * Profile save helper. An unchanged nickname — including one that is empty or
 * longer than the cap — is omitted so other fields can save. A real edit must
 * trim to a non-empty name within the cap. Clearing is rejected.
 */
export function profileNicknameUpdate(
  edited: string,
  stored: string | null | undefined,
): { nickname?: string; error: string | null } {
  const trimmed = edited.trim()
  const storedTrimmed = stored?.trim() ?? ''
  if (trimmed === storedTrimmed) return { error: null }
  const parsed = nicknameForWrite(edited)
  if (!parsed.ok) return { error: parsed.error }
  return { nickname: parsed.nickname, error: null }
}

export type DisplayNameInput = {
  nickname?: string | null
  fullName?: string | null
  email?: string | null
}

export type DisplayNameOptions = {
  /** Home greeting and welcome email: first word of full name, not the whole name. */
  firstName?: boolean
}

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function hasLetter(value: string): boolean {
  return /\p{L}/u.test(value)
}

/** Whole value is showable: non-empty, no "@" anywhere, and at least one letter. */
function usableName(value: string | null | undefined): string | null {
  const name = trimmed(value)
  if (!name || name.includes('@') || !hasLetter(name)) return null
  return name
}

/** First word, with getFirstName's 40-character cap. The whole value is rejected if it contains "@". */
function usableFirstWord(value: string | null | undefined): string | null {
  const name = usableName(value)
  if (!name) return null
  const first = name.split(/\s+/)[0]
  if (!first || first.length > GREETING_NAME_MAX_LENGTH || !hasLetter(first)) return null
  return first
}

function emailLocalPart(value: string | null | undefined, firstName: boolean): string | null {
  const raw = trimmed(value)
  if (!raw || /\s/u.test(raw)) return null
  const at = raw.indexOf('@')
  if (at <= 0) return null
  const local = raw.slice(0, at)
  if (!local || !hasLetter(local)) return null
  if (firstName && local.length > GREETING_NAME_MAX_LENGTH) return null
  return local
}

/**
 * Welcome-screen suggestion. An existing nickname wins (trimmed), otherwise the
 * first word of a full name that is non-empty and contains no "@".
 * Either source is truncated to the nickname cap so the field is never over it.
 * Never the email local part — an empty result must not be saved as a nickname.
 */
export function onboardingNamePrefill(input: {
  nickname?: string | null
  fullName?: string | null
}): string {
  const nickname = trimmed(input.nickname)
  if (nickname) return nickname.slice(0, NICKNAME_MAX_LENGTH)
  const fullName = trimmed(input.fullName)
  if (!fullName || fullName.includes('@')) return ''
  const first = fullName.split(/\s+/)[0] ?? ''
  return first.slice(0, NICKNAME_MAX_LENGTH)
}

export function displayName(
  input: DisplayNameInput,
  fallback: string,
  options?: DisplayNameOptions,
): string {
  const firstName = options?.firstName === true
  const nickname = usableName(input.nickname)
  if (nickname) return nickname
  const fullName = firstName ? usableFirstWord(input.fullName) : usableName(input.fullName)
  if (fullName) return fullName
  return emailLocalPart(input.email, firstName) ?? emailLocalPart(input.fullName, firstName) ?? fallback
}
