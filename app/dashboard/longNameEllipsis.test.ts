import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

function source(relative: string) {
  return readFileSync(path.join(process.cwd(), relative), 'utf8')
}

describe('long stored names in the sidebar and on Home', () => {
  it('ellipsizes the sidebar name and the Home greeting without cutting the stored value', () => {
    const sidebarCss = source('app/globals.css')
    const homeCss = `${source('app/klaroph-v2.css')}\n${sidebarCss}`
    expect(sidebarCss).toMatch(/\.sidebar-user-name \{[^}]*text-overflow:\s*ellipsis[^}]*\}/s)
    expect(homeCss).toMatch(/\.dashboard-greeting-title \{[^}]*text-overflow:\s*ellipsis[^}]*\}/s)

    const sidebar = source('components/layout/Sidebar.tsx')
    const home = source('app/dashboard/page.tsx')
    expect(sidebar).toContain('displayName(')
    expect(sidebar).toContain('title={`Hi ${userName}`}')
    expect(sidebar).not.toContain('.slice(')
    expect(home).toContain('resolveDisplayName(')
    expect(home).toContain('title={`${greeting}, ${greetingName}!`}')
    expect(home).not.toContain('greetingName.slice')
  })

  it('keeps profile edits on the shared cap and omits an unchanged nickname', () => {
    const profile = source('app/dashboard/profile/page.tsx')
    expect(profile).toContain('maxLength={NICKNAME_MAX_LENGTH}')
    expect(profile).toContain('profileNicknameUpdate')
    expect(profile).toContain('if (decision.nickname === undefined) return')
    expect(profile).not.toContain('.slice(')
  })
})
