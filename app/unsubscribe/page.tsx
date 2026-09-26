import Link from 'next/link'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

export const metadata = {
  title: 'Email preferences — KlaroPH',
  description: 'Unsubscribe from KlaroPH product updates.',
  robots: { index: false, follow: false },
}

type SearchParams = { token?: string; status?: string }
type PageProps = { searchParams: Promise<SearchParams> }

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  done: {
    title: "You're unsubscribed",
    body: "You won't receive KlaroPH product updates anymore. Account and security emails, like password resets and payment receipts, will still reach you.",
  },
  invalid: {
    title: 'This link is not valid',
    body: 'The unsubscribe link may be incomplete. Try the link from the most recent KlaroPH email, or contact us and we will remove you.',
  },
  error: {
    title: 'Something went wrong',
    body: 'We could not update your preference just now. Please try again in a moment, or contact us and we will remove you.',
  },
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { token, status } = await searchParams
  const result = status ? STATUS_COPY[status] : undefined

  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-logo">
          <KlaroPHHandLogo size={40} variant="onBlue" />
        </Link>
        <Link href="/" className="legal-back">← Back to home</Link>
      </header>

      <main className="legal-main">
        {result ? (
          <>
            <h1 className="legal-title">{result.title}</h1>
            <section className="legal-section">
              <p>{result.body}</p>
            </section>
          </>
        ) : token ? (
          <>
            <h1 className="legal-title">Unsubscribe from KlaroPH updates?</h1>
            <section className="legal-section">
              <p>
                You&apos;ll stop receiving product news and announcements. Account and security emails will still
                reach you.
              </p>
              <form method="post" action="/api/email/unsubscribe">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="source" value="page" />
                <button type="submit" className="btn-primary">Unsubscribe</button>
              </form>
            </section>
          </>
        ) : (
          <>
            <h1 className="legal-title">{STATUS_COPY.invalid.title}</h1>
            <section className="legal-section">
              <p>{STATUS_COPY.invalid.body}</p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
