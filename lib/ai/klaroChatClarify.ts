/**
 * Ask Klaro clarification copy. The application decides WHEN to clarify;
 * this module only phrases the question. Choices must come from the resolver
 * (fixed topic lists or the authenticated user's own goal names).
 */

import type { ClarifyReason } from '@/lib/ai/klaroDialogueResolver'

function joinChoices(choices: string[]): string {
  if (choices.length <= 1) return choices[0] ?? ''
  if (choices.length === 2) return `${choices[0]} or ${choices[1]}`
  return `${choices.slice(0, -1).join(', ')}, or ${choices[choices.length - 1]}`
}

/** Deterministic clarification — used when Gemini is unavailable or its phrasing is rejected. */
export function buildClarifyFallback(reason: ClarifyReason, choices: string[]): string {
  switch (reason) {
    case 'vague_overview':
      return `I can look at that a few ways — your ${joinChoices(choices)}. Which one would you like to check?`
    case 'savings_purpose':
      return `Happy to help. Are you saving for ${joinChoices(choices)}?`
    case 'goal_unspecified':
      return choices.length > 0
        ? `Sure — which goal do you mean: ${joinChoices(choices)}?`
        : `Sure — which goal do you mean?`
    case 'unresolved_reference':
      return `I'm not sure what "it" refers to here. Do you want to look at your ${joinChoices(choices)}?`
    case 'out_of_scope':
      return `That's outside what I can help with. I can answer questions about your KlaroPH ${joinChoices(choices)} — want me to check one of those?`
    case 'loan_details':
      return `I can estimate that loan for you. I just need ${joinChoices(choices)} — could you share that?`
  }
}

/** Prompt for Gemini to phrase the already-decided clarification question naturally. */
export function buildClarifyUserPrompt(params: {
  message: string
  reason: ClarifyReason
  choices: string[]
}): string {
  return [
    'KlaroPH has determined that the user\'s message needs a clarification question before answering.',
    'Write ONE short, friendly clarification question (1–2 sentences).',
    params.reason === 'loan_details'
      ? 'Ask ONLY for these missing loan details (do not estimate anything yet):'
      : 'Offer ONLY these choices, using the exact wording given, and nothing else:',
    JSON.stringify(params.choices),
    `Reason (internal, never mention it): ${params.reason}`,
    'Do not answer the financial question. Do not include any amounts, numbers, dates, goals, or categories that are not in the choices list. Do not mention intents or technical terms.',
    'End with a question mark.',
    '',
    'User message:',
    params.message,
  ].join('\n')
}

/**
 * Accept Gemini's clarification only if it stays within bounds:
 * ends as a question, introduces no amounts, and (for goals) names every real goal offered.
 */
export function isAcceptableClarification(
  text: string,
  reason: ClarifyReason,
  choices: string[]
): boolean {
  const t = text.trim()
  if (!t.endsWith('?')) return false
  if (/₱|\bphp\b|\d/i.test(t)) return false
  if (t.length > 400) return false
  if (reason === 'goal_unspecified') {
    const lower = t.toLowerCase()
    if (!choices.every((c) => lower.includes(c.toLowerCase()))) return false
  }
  return true
}
