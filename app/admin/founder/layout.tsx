import type { Metadata } from 'next'
import { requireFounder } from '@/lib/founder/access'
import FounderDockNav from '@/components/founder/FounderDockNav'
import './founder-dock.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mission Control — KlaroPH',
  robots: { index: false, follow: false },
}

export default async function FounderDockLayout({ children }: { children: React.ReactNode }) {
  const founder = await requireFounder()
  return (
    <div className="fd-root">
      <FounderDockNav founderEmail={founder.email} />
      <main className="fd-main">{children}</main>
    </div>
  )
}
