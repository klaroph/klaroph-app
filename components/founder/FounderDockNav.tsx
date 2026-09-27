'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

const NAV = [
  { href: '/admin/founder', label: 'Overview' },
  { href: '/admin/founder/users', label: 'Users' },
  { href: '/admin/founder/support', label: 'Support' },
  { href: '/admin/founder/marketing', label: 'Marketing' },
  { href: '/admin/founder/revenue', label: 'Revenue' },
  { href: '/admin/founder/health', label: 'Health' },
] as const

export default function FounderDockNav({ founderEmail }: { founderEmail: string }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/admin/founder' ? pathname === href : pathname.startsWith(href))

  return (
    <aside className="fd-nav" aria-label="Founder Dock">
      <div className="fd-nav-brand">
        <KlaroPHHandLogo variant="onBlue" size={26} />
        <span className="fd-nav-brand-tag">Mission Control</span>
      </div>
      <nav className="fd-nav-links">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`fd-nav-link${isActive(item.href) ? ' is-active' : ''}`}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="fd-nav-footer">
        <span className="fd-nav-email">{founderEmail}</span>
        <Link href="/dashboard" className="fd-nav-back">
          ← Back to KlaroPH
        </Link>
      </div>
    </aside>
  )
}
