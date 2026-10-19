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
 * A set nickname is kept whole — that is already what we call the person.
 */

export const NICKNAME_MAX_LENGTH = 40

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
  if (!first || first.length > NICKNAME_MAX_LENGTH || !hasLetter(first)) return null
  return first
}

function emailLocalPart(value: string | null | undefined, firstName: boolean): string | null {
  const raw = trimmed(value)
  if (!raw || /\s/u.test(raw)) return null
  const at = raw.indexOf('@')
  if (at <= 0) return null
  const local = raw.slice(0, at)
  if (!local || !hasLetter(local)) return null
  if (firstName && local.length > NICKNAME_MAX_LENGTH) return null
  return local
}

/**
 * Welcome-screen suggestion. An existing nickname wins whole (trimmed, capped).
 * Otherwise the first word of a full name that is non-empty and contains no "@".
 * Never the email local part — skipping the field must leave profiles.nickname unset.
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
