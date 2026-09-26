import { KLARO_AI_CHAT_LIMITS } from '@/lib/ai/chatLimits'

export function validateChatMessage(
  input: unknown
): { ok: true; message: string } | { ok: false; error: string } {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Message must be a string.' }
  }
  const message = input.trim()
  if (!message) {
    return { ok: false, error: 'Message cannot be empty.' }
  }
  if (message.length > KLARO_AI_CHAT_LIMITS.MAX_MESSAGE_LENGTH) {
    return { ok: false, error: 'Message is too long.' }
  }
  return { ok: true, message }
}
