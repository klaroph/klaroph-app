import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

function source(relative: string) {
  return readFileSync(path.join(process.cwd(), relative), 'utf8')
}

describe('long stored names in the sidebar and on Home', () => {
  it('clamps the Home greeting to two lines and ellipsizes only the sidebar name', () => {
    const sidebarCss = source('app/globals.css')
    const homeCss = source('app/klaroph-v2.css')
    expect(sidebarCss).toMatch(/\.sidebar-user-name \{[^}]*text-overflow:\s*ellipsis[^}]*\}/s)
    expect(homeCss).toMatch(
      /\.dashboard-greeting-title \{\s*display:\s*-webkit-box;[^}]*-webkit-line-clamp:\s*2;[^}]*line-clamp:\s*2;/s,
    )
    expect(homeCss).not.toMatch(/\.dashboard-greeting-title \{[^}]*white-space:\s*nowrap/)
    expect(sidebarCss).toMatch(
      /\.dashboard-page-header \.dashboard-greeting-title \{[^}]*-webkit-line-clamp:\s*2;[^}]*line-clamp:\s*2;/s,
    )
    expect(sidebarCss).not.toMatch(
      /\.dashboard-page-header \.dashboard-greeting-title \{[^}]*white-space:\s*nowrap/,
    )

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
