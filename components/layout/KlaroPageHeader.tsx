'use client'

import type { ReactNode } from 'react'
import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'

type KlaroPageHeaderProps = {
  title: ReactNode
  description?: string
  /** Optional meta line under the description (e.g. “Last updated”) */
  meta?: ReactNode
  /** Primary/secondary actions (desktop; wraps on mobile) */
  actions?: ReactNode
  /** Use h1 for SEO tool pages; default h2 for app nav pages */
  titleAs?: 'h1' | 'h2'
  className?: string
}

/**
 * Shared V2 page header — matches the Dashboard command-center header rhythm.
 * Always includes the mobile KlaroPH logo row.
 */
export default function KlaroPageHeader({
  title,
  description,
  meta,
  actions,
  titleAs = 'h2',
  className = '',
}: KlaroPageHeaderProps) {
  const TitleTag = titleAs

  return (
    <header
      className={[
        'page-header',
        'dashboard-page-header',
        'klaro-page-header',
        actions ? 'page-header-with-actions' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="klaro-page-header-copy min-w-0 flex-1 max-lg:w-full">
        <div className="max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:overflow-visible">
          <TitleTag className="klaro-page-header-title max-lg:text-lg max-lg:font-semibold max-lg:leading-tight max-lg:mb-0">
            {title}
          </TitleTag>
          <DashboardMobileHeaderLogo />
        </div>
        {description ? (
          <p className="klaro-page-header-desc max-lg:mt-1 max-lg:text-xs max-lg:leading-snug max-lg:mb-0">
            {description}
          </p>
        ) : null}
        {meta ? <div className="klaro-page-header-meta">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="page-header-actions klaro-page-header-actions">{actions}</div>
      ) : null}
    </header>
  )
}
