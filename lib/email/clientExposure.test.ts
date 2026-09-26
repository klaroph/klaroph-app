import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks']
const SERVER_ONLY_EMAIL = /@\/lib\/(email\/|welcomeEmail|premiumConfirmationEmail|accountDeletedEmail|resendFrom)/

function sourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

const files = SOURCE_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)))
// .env.example is git-ignored, so clean checkouts (CI, worktrees) do not have it.
const envExample = path.join(ROOT, '.env.example')

describe('RESEND_API_KEY stays server-side', () => {
  it('is never exposed through a NEXT_PUBLIC_ variable', () => {
    const offenders = [...files, ...(existsSync(envExample) ? [envExample] : [])].filter((f) =>
      /NEXT_PUBLIC_[A-Z_]*(RESEND|MARKETING)/.test(readFileSync(f, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('is not referenced, and email modules are not imported, by client components', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8')
      if (!/^\s*['"]use client['"]/.test(src)) return false
      return src.includes('RESEND_API_KEY') || /from ['"]resend['"]/.test(src) || SERVER_ONLY_EMAIL.test(src)
    })
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([])
  })
})
