'use client'

import Image from 'next/image'
import UpgradeCTA from '@/components/ui/UpgradeCTA'

/**
 * Pro promotion for the dashboard. Presentation only — the upgrade action stays
 * in UpgradeCTA (existing subscription / PayMongo logic untouched).
 */
export default function DashboardProCard() {
  return (
    <aside className="dash-pro-card" aria-label="Upgrade to KlaroPH Pro">
      <div className="dash-pro-card-body">
        <p className="dash-pro-card-title">
          Same values.
          <br />
          More possibilities.
        </p>
        <p className="dash-pro-card-text">
          Plan better. Live brighter.
          <br />A more empowered you is possible.
        </p>
        <UpgradeCTA label="Upgrade to KlaroPH Pro →" variant="compact" />
      </div>
      <div className="dash-pro-card-art-wrap" aria-hidden>
        <Image
          src="/illustrations/upgrade-pro-hiker.png"
          alt=""
          width={197}
          height={755}
          className="dash-pro-card-art"
          sizes="200px"
        />
      </div>
    </aside>
  )
}
