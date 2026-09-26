/**
 * Chat-specific sanitization — must NOT reuse insight's 1200-char hard collapse
 * that also destroys newlines needed for bullet answers.
 */

import { KLARO_AI_CHAT_LIMITS } from '@/lib/ai/chatLimits'

/** True when text ends on a truncated PHP amount (e.g. ₱41,2 instead of ₱41,226). */
export function endsWithTruncatedPesoAmount(text: string): boolean {
  const t = String(text ?? '').trim()
  if (!/₱/.test(t)) return false
  // Trailing comma/dot mid-number: ₱41, or ₱41.
  if (/₱[\d,]*[,.]$/.test(t)) return true
  // Incomplete thousands group after comma (must be 3 digits when grouped): ₱41,2
  if (/₱\d{1,3},\d{1,2}$/.test(t)) return true
  // Bare ₱ with no digits
  if (/₱\s*$/.test(t)) return true
  return false
}

/** True when the reply looks cut off mid-thought (common Gemini early-stop). */
export function isIncompleteAssistantReply(text: string): boolean {
  const t = String(text ?? '').trim()
  if (!t) return true
  if (/[:：]\s*$/.test(t)) return true
  if (/[•\-*]\s*$/.test(t)) return true
  // Known truncated phrase from live Ask Klaro failure
  if (/\bhere are the areas\s*$/i.test(t)) return true
  // Live failure: mid-peso cut ("…surplus of ₱41,2")
  if (endsWithTruncatedPesoAmount(t)) return true
  // Ends on a dangling connector / determiner (mid-sentence cut)
  if (
    /\b(are|the|a|an|to|for|with|of|and|or|here|these|those|following|areas|including|such|as)\s*$/i.test(
      t
    )
  ) {
    return true
  }
  // Intro that never finishes (no sentence punctuation at all after the intro)
  if (
    /^(looking at|here are|here's|here is|even though|although)\b/i.test(t) &&
    !/[.!?…]/.test(t) &&
    t.length < 200
  ) {
    return true
  }
  // Short reply with currency but no sentence-ending punctuation (early stop mid-thought)
  if (t.length < 120 && /₱/.test(t) && !/[.!?…]["')\]]*\s*$/.test(t)) {
    return true
  }
  return false
}

/**
 * Strip tags/control chars, preserve paragraph breaks, bound length.
 * Does not apply the insight-card 1200-char hard collapse.
 * Returns null for empty or incomplete replies so the service can fall back.
 *
 * Length capping never cuts mid-sentence when a sentence boundary exists near the limit;
 * after any cap, incomplete detection still runs (rejects mid-peso cuts).
 */
export function sanitizeChatText(
  raw: string,
  maxLen = KLARO_AI_CHAT_LIMITS.MAX_RESPONSE_CHARS
): string | null {
  let text = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // keep newlines; collapse spaces/tabs only
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return null
  if (text.length > maxLen) {
    const sliced = text.slice(0, maxLen)
    const lastStop = Math.max(
      sliced.lastIndexOf('.'),
      sliced.lastIndexOf('!'),
      sliced.lastIndexOf('?')
    )
    text = (lastStop > maxLen * 0.6 ? sliced.slice(0, lastStop + 1) : sliced).trim()
  }
  if (isIncompleteAssistantReply(text)) return null
  return text
}
