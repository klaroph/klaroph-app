'use client'

import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

/**
 * Hand logo aligned with page title (same row on mobile/tablet).
 * Hidden at lg+ where the sidebar shows the brand.
 */
export default function DashboardMobileHeaderLogo() {
  return (
    <div className="dashboard-header-logo-mobile flex shrink-0 items-center justify-end overflow-visible lg:hidden">
      <KlaroPHHandLogo
        size={40}
        variant="onWhite"
        showText={false}
        className="dashboard-header-logo-scale"
      />
    </div>
  )
}
