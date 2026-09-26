/**
 * Bound + strip tags from model output before storing/displaying.
 * Pure — safe to import from tests without DB clients.
 */
export function sanitizeInsightText(raw: string): string | null {
  let text = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  if (text.length > 1200) text = text.slice(0, 1200).trim()
  return text
}
