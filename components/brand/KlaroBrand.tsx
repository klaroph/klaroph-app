import type { CSSProperties, ReactNode } from 'react'

export type KlaroTone = 'sky' | 'sun' | 'lavender' | 'mint'

function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const KLARO_ICONS = {
  clarity: (
    <LineIcon>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </LineIcon>
  ),
  earn: (
    <LineIcon>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M16.5 14.5h1.5" />
    </LineIcon>
  ),
  purpose: (
    <LineIcon>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" />
    </LineIcon>
  ),
  spend: (
    <LineIcon>
      <path d="M4 19.5h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-6" />
    </LineIcon>
  ),
  grow: (
    <LineIcon>
      <path d="M3.5 17l5.5-5.5 4 4 7.5-7.5" />
      <path d="M15 8h5.5v5.5" />
    </LineIcon>
  ),
} satisfies Record<string, ReactNode>

type PrincipleCardProps = {
  tone: KlaroTone
  icon: ReactNode
  title: string
  copy: string
  heading?: 'h3' | 'h5'
  step?: string
  style?: CSSProperties
}

export function PrincipleCard({ tone, icon, title, copy, heading: Heading = 'h3', step, style }: PrincipleCardProps) {
  return (
    <li className={`klaro-principle-card klaro-tint klaro-tone-${tone}`} style={style}>
      {step && <span className="klaro-principle-card-step">{step}</span>}
      <div className="klaro-principle-card-head">
        <span className="klaro-principle-card-icon">{icon}</span>
        <Heading className="klaro-principle-card-title">{title}</Heading>
      </div>
      <p className="klaro-principle-card-copy">{copy}</p>
    </li>
  )
}

export const KLARO_FLOW = ['Earn', 'Plan', 'Spend', 'Grow'] as const

export function KlaroFlow({ className }: { className?: string }) {
  return (
    <ol className={className ? `klaro-flow ${className}` : 'klaro-flow'} aria-label="The KlaroPH flow">
      {KLARO_FLOW.map((step) => (
        <li key={step}>
          <span className="klaro-flow-step">{step}</span>
        </li>
      ))}
    </ol>
  )
}
