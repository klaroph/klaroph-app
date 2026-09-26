'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type KlaroAIButtonProps = {
  className?: string
}

/** Floating entry to Ask Klaro — navigates to the dedicated chat page. */
export default function KlaroAIButton({ className = '' }: KlaroAIButtonProps) {
  const pathname = usePathname()
  if (pathname?.startsWith('/dashboard/ask-klaro')) return null

  return (
    <Link
      href="/dashboard/ask-klaro"
      className={`klaro-ai-fab ${className}`.trim()}
      aria-label="Ask Klaro"
      title="Ask Klaro"
    >
      <span className="klaro-ai-fab-icon" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v2" />
          <path d="M12 19v2" />
          <path d="M5 12H3" />
          <path d="M21 12h-2" />
          <circle cx="12" cy="12" r="6" />
          <path d="M9.5 12h.01M14.5 12h.01" />
        </svg>
      </span>
      <span className="klaro-ai-fab-label">Ask Klaro</span>
    </Link>
  )
}
