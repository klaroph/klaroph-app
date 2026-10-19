import Link from 'next/link'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

const LAST_UPDATED = 'October 2026'

export const metadata = {
  title: 'Terms & Conditions — KlaroPH',
  description: 'KlaroPH Terms and Conditions of use.',
}

export default function TermsPage() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-logo">
          <KlaroPHHandLogo size={40} variant="onBlue" />
        </Link>
        <Link href="/" className="legal-back">← Back to home</Link>
      </header>

      <main className="legal-main">
        <h1 className="legal-title">Terms &amp; Conditions</h1>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

        <section className="legal-section">
          <h2>Acceptance of Terms</h2>
          <p>
            By creating an account or using KlaroPH, you agree to these Terms and Conditions. If you do not agree,
            please do not use the service. We may update these terms from time to time; continued use after changes
            constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="legal-section">
          <h2>Use of Service</h2>
          <p>
            KlaroPH provides a personal finance dashboard and tools to help you track income, expenses, and goals.
            The service is intended for personal use. You must be at least 18 years old (or the age of majority in
            your jurisdiction) to use KlaroPH.
          </p>
        </section>

        <section className="legal-section">
          <h2>User Responsibilities</h2>
          <p>You agree to:</p>
          <ul>
            <li>Provide accurate account information and keep your login credentials secure</li>
            <li>Use the service only for lawful purposes and in accordance with these terms</li>
            <li>Not attempt to gain unauthorized access to our systems or other users&apos; data</li>
            <li>Not use the service in any way that could harm, disable, or overburden KlaroPH</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Data Accuracy Disclaimer</h2>
          <p>
            You are responsible for the accuracy of the financial data you enter. KlaroPH provides tools for
            tracking and visualization only. We do not guarantee the accuracy of calculations or projections, and
            the service is not a substitute for professional financial, tax, or legal advice.
          </p>
        </section>

        <section className="legal-section">
          <h2>Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, KlaroPH and its operators shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits or data, arising from your
            use of the service. Our total liability shall not exceed the amount you paid us (if any) in the twelve
            months preceding the claim.
          </p>
        </section>

        <section className="legal-section">
          <h2>KlaroPH Pro</h2>
          <p>
            KlaroPH Pro costs ₱999, paid once. Pay once. No subscription. Pro stays on your account for as long as
            KlaroPH runs. KlaroPH does not charge you again for that purchase.
          </p>
          <p>
            You can ask for a full refund within 7 days of purchase by contacting support at{' '}
            <a href="mailto:support@klaroph.com" className="legal-link">support@klaroph.com</a>.
            Refunds are handled manually. Pro is removed from your account when the refund goes through. A chargeback
            removes Pro.
          </p>
          <p>
            If KlaroPH closes, we will tell you at least 45 days ahead by email and with an in-app banner. Export stays
            open until the service shuts down.
          </p>
          <p>
            Any signed-in user can download klaroph-export.csv. The columns are Type, Date, Amount, and
            Category/Source. An Income row puts the income source in Category/Source. An Expense row puts the expense
            category in Category/Source. The file does not include the expense type, descriptions, notes, or any other
            account data.
          </p>
          <p>Deleting your account ends Pro.</p>
        </section>

        <section className="legal-section">
          <h2>Third-Party Services</h2>
          <p>KlaroPH uses these services to run the app:</p>
          <ul>
            <li>Supabase stores your account and the records you save, and handles sign-in.</li>
            <li>
              Google sign-in is available. If you choose it, Google shares the email and basic profile used to sign
              you in.
            </li>
            <li>Vercel hosts the app and runs its scheduled job.</li>
            <li>PayMongo processes the one-time ₱999 KlaroPH Pro payment.</li>
            <li>
              Google Gemini writes Klaro Insight and Ask Klaro replies. The Privacy Policy states which details are
              sent.
            </li>
            <li>Resend sends KlaroPH email.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Termination</h2>
          <p>
            KlaroPH may terminate an account only when it breaks these terms. You may close your account at any time.
            When an account ends, the right to use KlaroPH ceases. We may retain or delete data as described in the
            Privacy Policy. If KlaroPH closes, the 45-day notice and the open export described in the KlaroPH Pro
            section apply.
          </p>
        </section>

        <section className="legal-section">
          <h2>Changes to Terms</h2>
          <p>
            We may update these Terms and Conditions from time to time. We will post the updated terms on this page
            and update the &ldquo;Last updated&rdquo; date. Material changes may be communicated via email or an
            in-app notice. Your continued use of KlaroPH after changes constitutes acceptance.
          </p>
        </section>

        <p className="legal-footer-note">
          <Link href="/" className="legal-link">Return to KlaroPH</Link>
        </p>
      </main>
    </div>
  )
}
