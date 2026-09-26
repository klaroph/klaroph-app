/**
 * Server-only Gemini client for KlaroPH AI.
 * Never import this from client components.
 */

import { GoogleGenAI } from '@google/genai'
import { KLARO_AI_LIMITS } from '@/lib/ai/limits'

export type GeminiGenerateResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'missing_key' | 'empty' | 'api_error'; message: string }

function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) return null
  return new GoogleGenAI({ apiKey: key })
}

export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || KLARO_AI_LIMITS.DEFAULT_MODEL
}

export async function generateGeminiText(params: {
  systemInstruction: string
  userPrompt: string
  /** Optional override; defaults to insight MAX_OUTPUT_TOKENS */
  maxOutputTokens?: number
}): Promise<GeminiGenerateResult> {
  const client = getClient()
  if (!client) {
    return { ok: false, reason: 'missing_key', message: 'GEMINI_API_KEY is not configured' }
  }

  const model = getGeminiModelName()
  const maxOutputTokens = params.maxOutputTokens ?? KLARO_AI_LIMITS.MAX_OUTPUT_TOKENS

  try {
    const timeoutMs = 12_000
    const response = await Promise.race([
      client.models.generateContent({
        model,
        contents: params.userPrompt,
        config: {
          systemInstruction: params.systemInstruction,
          temperature: KLARO_AI_LIMITS.TEMPERATURE,
          maxOutputTokens,
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini request timed out')), timeoutMs)
      }),
    ])

    const text = (response.text ?? '').trim()
    if (!text) {
      return { ok: false, reason: 'empty', message: 'Gemini returned empty text' }
    }
    return { ok: true, text }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini request failed'
    console.error('[klaro-ai] gemini_api_error', { model, message: message.slice(0, 200) })
    return { ok: false, reason: 'api_error', message }
  }
}
