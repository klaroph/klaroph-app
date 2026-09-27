import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.join(__dirname, 'LandingPageClient.tsx'), 'utf8')

describe('password login landing', () => {
  it('hands the destination to the server (proxy) instead of hard-coding the dashboard', () => {
    const handleLogin = source.match(/const handleLogin = async[\s\S]*?\r?\n {2}}\r?\n/)?.[0] ?? ''
    expect(handleLogin).toContain('signInWithPassword')
    expect(handleLogin).toContain("window.location.replace('/')")
    expect(handleLogin).not.toContain("'/dashboard'")
  })

  it('does not decide founder status in the browser', () => {
    expect(source).not.toMatch(/FOUNDER_EMAIL|admin\/founder/)
  })
})
