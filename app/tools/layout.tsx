export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  // The calculator pages use a dedicated layout under app/tools/(calc)/layout.tsx.
  // This layout intentionally stays minimal so /tools can be a dedicated SEO hub page.
  return <>{children}</>
}
