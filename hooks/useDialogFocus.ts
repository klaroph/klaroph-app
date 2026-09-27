'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

function tabbables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('disabled') && el.getClientRects().length > 0
  )
}

/**
 * Where TAB should wrap to, or null to let the browser move focus natively.
 * Only the ends of the list (or focus that has left the dialog) are intercepted,
 * so the DOM order inside the dialog stays the TAB order.
 */
export function trapTarget<T>(items: readonly T[], active: T | null, shiftKey: boolean): T | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  const inside = active !== null && items.includes(active)
  if (shiftKey) return !inside || active === first ? last : null
  return !inside || active === last ? first : null
}

/**
 * Modal focus lifecycle: focus `initialFocusRef` on open, keep TAB / SHIFT+TAB inside
 * `containerRef`, and return focus to whatever was focused before opening once closed.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    ;(initialFocusRef.current ?? tabbables(container)[0])?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = tabbables(container)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const inDialog = current !== null && container.contains(current)
      if (inDialog && !items.includes(current)) return
      const target = trapTarget(items, inDialog ? current : null, e.shiftKey)
      if (target) {
        e.preventDefault()
        target.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [active, containerRef, initialFocusRef])
}
