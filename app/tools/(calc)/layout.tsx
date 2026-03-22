import Link from 'next/link'
import ToolsCalcColumn from '@/components/tools/ToolsCalcColumn'
import ToolsRightColumn from '@/components/tools/ToolsRightColumn'
import ToolsPublicContentWrapper from '@/components/tools/ToolsPublicContentWrapper'
import Footer from '@/components/Footer'

export default function ToolsCalcLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tools-public-wrap">
      <header className="tools-public-header tools-public-header--calc-only">
        <Link href="/" className="tools-public-back">
          ← Back to home
        </Link>
      </header>
      <main className="tools-public-main">
        <ToolsPublicContentWrapper>
          <div className="tools-public-calc">
            <ToolsCalcColumn>{children}</ToolsCalcColumn>
          </div>
          <ToolsRightColumn />
        </ToolsPublicContentWrapper>
      </main>
      <Footer variant="default" />
    </div>
  )
}

