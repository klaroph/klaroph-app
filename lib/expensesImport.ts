/**
 * Shared CSV import engine: expenses and income.
 * Columns: date, amount, category, description.
 * Max 500 rows, max 1MB file. Category set is mode-specific (expense categories vs income sources).
 */

import { toLocalDateString, parseLocalDateString } from '@/lib/format'
import { EXPENSE_CATEGORIES, getTypeForCategory } from '@/lib/expenseCategories'
import { INCOME_SOURCES } from '@/lib/incomeSources'

const MAX_ROWS = 500
const MAX_FILE_BYTES = 1024 * 1024 // 1MB

const EXPENSE_CATEGORIES_SET = new Set(EXPENSE_CATEGORIES.map((c) => c.value))
const INCOME_SOURCES_SET = new Set(INCOME_SOURCES)

/** Single row shape for both expense and income import (category = expense category or income source). */
export type ImportRow = {
  date: string
  amount: number
  category: string
  description: string | null
}

/** @deprecated Use ImportRow */
export type ExpenseImportRow = ImportRow

export type RowValidationError = {
  row: number
  field?: string
  message: string
}

export type ValidationResult = {
  ok: boolean
  rows: ImportRow[]
  errors: RowValidationError[]
  skippedEmpty: number
  unknownCategories: string[]
}

/** Simple CSV line parse: respects double-quoted fields with commas inside. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (inQuotes) {
      cur += c
    } else if (c === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}

function parseDate(val: string): string | null {
  const s = String(val).trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [, y, m, d] = iso
    const year = parseInt(y!, 10)
    const month = parseInt(m!, 10)
    const day = parseInt(d!, 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day)
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return `${y}-${m}-${d}`
      }
    }
  }
  // Parse as local when date-only (YYYY-MM-DD) to avoid Safari UTC interpretation
  const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? parseLocalDateString(s) : new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return toLocalDateString(d)
  }
  return null
}

function parseAmount(val: string): number | null {
  const s = String(val).trim().replace(/,/g, '')
  if (!s) return null
  const n = parseFloat(s)
  if (Number.isNaN(n)) return null
  return n
}

/**
 * Shared validation pipeline. Same rules for expenses and income:
 * validate date, amount numeric, category in allowed set, skip empty rows, max 500 rows.
 */
export function validateCsv(content: string, validCategories: Set<string>): ValidationResult {
  const errors: RowValidationError[] = []
  const rows: ImportRow[] = []
  let skippedEmpty = 0
  const unknownCategories = new Set<string>()

  const lines = content.split(/\r?\n/).map((l) => l.trim())
  if (lines.length === 0) {
    return { ok: false, rows: [], errors: [], skippedEmpty: 0, unknownCategories: [] }
  }

  const headerCols = parseCsvLine(lines[0])
  const dateIdx = headerCols.findIndex((c) => c.trim().toLowerCase() === 'date')
  const amountIdx = headerCols.findIndex((c) => c.trim().toLowerCase() === 'amount')
  const categoryIdx = headerCols.findIndex((c) => c.trim().toLowerCase() === 'category')
  const descIdx = headerCols.findIndex((c) => c.trim().toLowerCase() === 'description')

  const di = dateIdx >= 0 ? dateIdx : 0
  const ai = amountIdx >= 0 ? amountIdx : 1
  const ci = categoryIdx >= 0 ? categoryIdx : 2
  const desci = descIdx >= 0 ? descIdx : 3

  for (let i = 1; i < lines.length; i++) {
    if (rows.length >= MAX_ROWS) {
      errors.push({ row: i + 1, message: `Maximum ${MAX_ROWS} rows allowed. Rest skipped.` })
      break
    }
    const cols = parseCsvLine(lines[i])
    const dateVal = cols[di] ?? ''
    const amountVal = cols[ai] ?? ''
    const categoryVal = (cols[ci] ?? '').trim()
    const descVal = (cols[desci] ?? '').trim() || null

    const isEmpty = !dateVal && !amountVal && !categoryVal && !descVal
    if (isEmpty) {
      skippedEmpty++
      continue
    }

    const date = parseDate(dateVal)
    if (!date) {
      errors.push({ row: i + 1, field: 'date', message: 'Invalid or missing date' })
      continue
    }
    const amount = parseAmount(amountVal)
    if (amount === null || amount <= 0) {
      errors.push({ row: i + 1, field: 'amount', message: 'Amount must be a positive number' })
      continue
    }
    if (!categoryVal) {
      errors.push({ row: i + 1, field: 'category', message: 'Category is required' })
      continue
    }
    if (!validCategories.has(categoryVal)) {
      unknownCategories.add(categoryVal)
      errors.push({ row: i + 1, field: 'category', message: `Unknown category: "${categoryVal}"` })
      continue
    }

    rows.push({
      date,
      amount,
      category: categoryVal,
      description: descVal || null,
    })
  }

  return {
    ok: errors.length === 0 && rows.length > 0,
    rows,
    errors,
    skippedEmpty,
    unknownCategories: Array.from(unknownCategories),
  }
}

export function validateExpensesCsv(content: string): ValidationResult {
  return validateCsv(content, EXPENSE_CATEGORIES_SET)
}

export function validateIncomeCsv(content: string): ValidationResult {
  return validateCsv(content, INCOME_SOURCES_SET)
}

export function getTypeForCategoryValue(category: string): 'needs' | 'wants' {
  return getTypeForCategory(category)
}

/** Server-side re-validation of parsed rows (for confirm endpoints). */
export function validateImportRows(
  rows: unknown,
  validCategories: Set<string>
): { ok: true; rows: ImportRow[] } | { ok: false; error: string } {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No rows provided.' }
  if (rows.length > MAX_ROWS) return { ok: false, error: `Maximum ${MAX_ROWS} rows allowed.` }
  const isoDate = /^\d{4}-\d{2}-\d{2}$/
  const out: ImportRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || typeof r !== 'object') return { ok: false, error: `Row ${i + 1}: invalid.` }
    const date = typeof (r as Record<string, unknown>).date === 'string' ? (r as Record<string, unknown>).date as string : ''
    const amount = typeof (r as Record<string, unknown>).amount === 'number' ? (r as Record<string, unknown>).amount as number : Number((r as Record<string, unknown>).amount)
    const category = typeof (r as Record<string, unknown>).category === 'string' ? (r as Record<string, unknown>).category as string : ''
    const description = (r as Record<string, unknown>).description != null ? String((r as Record<string, unknown>).description) : null
    if (!isoDate.test(date)) return { ok: false, error: `Row ${i + 1}: invalid date.` }
    if (Number.isNaN(amount) || amount <= 0) return { ok: false, error: `Row ${i + 1}: amount must be a positive number.` }
    if (!category || !validCategories.has(category)) return { ok: false, error: `Row ${i + 1}: invalid or unknown category.` }
    out.push({ date, amount, category, description: description || null })
  }
  return { ok: true, rows: out }
}

export { MAX_ROWS, MAX_FILE_BYTES }
export const VALID_CATEGORIES = EXPENSE_CATEGORIES_SET
export { INCOME_SOURCES_SET }
