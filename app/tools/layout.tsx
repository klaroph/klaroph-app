import Link from 'next/link'
import { ToolsPricingFree, ToolsPricingPro } from '@/components/tools/ToolsPricingPanel'
import ToolsCalcColumn from '@/components/tools/ToolsCalcColumn'

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tools-public-wrap">
      <header className="tools-public-header">
        <Link href="/" className="tools-public-logo" aria-label="KlaroPH home">
          <img src="/logo-klaroph-blue.png" alt="" width={120} height={32} style={{ display: 'block', height: 32, width: 'auto' }} />
        </Link>
        <Link href="/" className="tools-public-back">
          ← Back to home
        </Link>
      </header>
      <main className="tools-public-main">
        <div className="tools-public-content">
          <div className="tools-public-calc">
            <ToolsCalcColumn>{children}</ToolsCalcColumn>
          </div>
          <ToolsPricingFree />
          <ToolsPricingPro />
        </div>
      </main>
    </div>
  )
}
