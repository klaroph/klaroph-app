import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

let cachedReduceMotion = false

export function prefersReducedMotion(): boolean {
  return cachedReduceMotion
}

export function rememberReducedMotion(value: boolean): void {
  cachedReduceMotion = value
}

export function usePrefersReducedMotion(): boolean {
  const [value, setValue] = useState(cachedReduceMotion)
  useEffect(() => {
    let alive = true
    const apply = (next: boolean) => {
      rememberReducedMotion(next)
      if (alive) setValue(next)
    }
    void AccessibilityInfo.isReduceMotionEnabled().then(apply)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', apply)
    return () => {
      alive = false
      subscription.remove()
    }
  }, [])
  return value
}
