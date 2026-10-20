import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'runtime.ts'), 'utf8')

describe('release env inlining', () => {
  it('reads the public Supabase keys as static member expressions', () => {
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL')
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY')
    expect(source).not.toMatch(/readPublicSupabaseConfig\(\s*process\.env\b/)
    expect(source).not.toContain('...process.env')
    expect(source).not.toMatch(/process\.env\[/)
  })
})
