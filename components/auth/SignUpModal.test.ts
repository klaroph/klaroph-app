import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(path.resolve(__dirname, 'SignUpModal.tsx'), 'utf8')

describe('SignUpModal focus wiring (source)', () => {
  it('uses the shared dialog focus hook with Email as the initial focus', () => {
    expect(src).toContain("import { useDialogFocus } from '@/hooks/useDialogFocus'")
    expect(src).toContain('useDialogFocus(dialogRef, emailRef, isOpen)')
    expect(src).toMatch(/<input\s+ref=\{emailRef\}\s+id="signup-email"/)
    expect(src).toMatch(/<div ref=\{dialogRef\} className="consent-modal signup-modal"/)
  })

  it('keeps dialog semantics with an accessible name in both states', () => {
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toContain("aria-labelledby={success ? 'signup-success-title' : 'signup-modal-title'}")
    expect(src).toContain('id="signup-modal-title"')
    expect(src).toContain('id="signup-success-title"')
    expect(src).toMatch(/className="signup-modal-close"\s+aria-label="Close"/)
  })

  it('keeps ESC and backdrop-click closing', () => {
    expect(src).toMatch(/e\.key === 'Escape'\) onClose\(\)/)
    expect(src).toMatch(/aria-labelledby=[^\n]+\n\s+onClick=\{handleClose\}/)
  })

  it('introduces no positive tabIndex', () => {
    expect(src).not.toMatch(/tabIndex=\{\s*[1-9]/)
  })
})
