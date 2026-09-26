/**
 * Ask Klaro replies to purely social messages ("Thanks!", "You're amazing!").
 * The resolver decides WHEN a message is casual; no financial data is used here.
 */

/** Deterministic reply — used when Gemini is unavailable or its phrasing is rejected. */
export function buildCasualFallback(message: string): string {
  const q = message.toLowerCase()
  if (/\b(who are you|what are you|what'?s your name|what is your name|what can you)\b/.test(q)) {
    return "I'm Klaro, your KlaroPH financial assistant. I can help you understand your spending, budget, goals, and cash flow using your Klaro data. What would you like to check?"
  }
  if (/\b(hello|hi|hiya|hey|good (morning|afternoon|evening|day)|kumusta|musta)\b/.test(q)) {
    return "Hi! 👋 I'm Klaro, your personal financial assistant. What would you like to look at?"
  }
  if (/\b(smarter|better|learning|improving)\b/.test(q)) {
    return "Haha, I'm learning! 😄 What would you like to look at next?"
  }
  if (/\b(smart|clever|impressive|nice work|well done|amazing|awesome|the best|lifesaver|a star|great job|good job|nice one|love it|helpful)\b/.test(q)) {
    return 'Haha, thank you! 😄 What would you like to look at next?'
  }
  if (/\b(thank|thanks|thx|ty|salamat|appreciate)\b/.test(q)) {
    return "You're welcome! 😄 I've got you. Ask me anything about your Klaro numbers."
  }
  return 'Got it! 😄 Just let me know what you want to check next.'
}

export function buildCasualUserPrompt(message: string): string {
  return [
    'The user sent a purely social message (a greeting, a question about who you are, thanks, a compliment, or an acknowledgement). It is not a financial question.',
    'Reply warmly in ONE short sentence, optionally followed by a short invitation to ask about their KlaroPH numbers. One emoji is fine.',
    'If they greet you or ask who you are, introduce yourself as Klaro, the KlaroPH personal financial assistant.',
    'Do not mention any amounts, numbers, categories, goals, budgets, or financial facts. Do not summarize their finances.',
    '',
    'User message:',
    message,
  ].join('\n')
}

/** Gemini's casual reply must stay short and free of financial figures. */
export function isAcceptableCasualReply(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= 240 && !/₱|\bphp\b|\d/i.test(t)
}
