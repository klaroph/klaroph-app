import Link from 'next/link'
import KlaroPHHandLogo from '@/components/ui/KlaroPHHandLogo'

const LAST_UPDATED = 'February 2025'

export const metadata = {
  title: 'Privacy Policy — KlaroPH',
  description: 'KlaroPH Privacy Policy. How we collect, use, and protect your information.',
}

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-logo">
          <KlaroPHHandLogo size={40} variant="onBlue" />
        </Link>
        <Link href="/" className="legal-back">← Back to home</Link>
      </header>

      <main className="legal-main">
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

        <section className="legal-section">
          <h2>Introduction</h2>
          <p>
            KlaroPH (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, store, and protect your information when you use our
            financial clarity app and related services. By using KlaroPH, you agree to the practices described below.
          </p>
        </section>

        <section className="legal-section">
          <h2>Information We Collect</h2>
          <p>We collect information necessary to provide and improve our service:</p>
          <ul>
            <li><strong>Account information:</strong> Email address when you create an account or sign in (e.g. with Google).</li>
            <li><strong>Financial data:</strong> Income, expenses, and goal amounts you enter to use the dashboard and tools. This data is stored so you can track your finances over time.</li>
          </ul>
          <p>We do not sell your personal or financial data.</p>
        </section>

        <section className="legal-section">
          <h2>How We Use Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the KlaroPH service</li>
            <li>Authenticate your account and keep it secure</li>
            <li>Display your dashboard, analytics, and goal progress</li>
            <li>Respond to support requests and communicate with you</li>
            <li>Comply with applicable laws and protect our rights</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Data Storage &amp; Security</h2>
          <p>
            Your data is stored using Supabase, a secure cloud platform. We use industry-standard security practices
            including encryption in transit and at rest. Access to your data is restricted and we take reasonable steps
            to protect it from unauthorized access, loss, or misuse.
          </p>
        </section>

        <section className="legal-section">
          <h2>Third-Party Services</h2>
          <p>
            We use Google OAuth to let you sign in with your Google account. When you choose &quot;Sign in with Google,&quot;
            Google may share your email and basic profile with us in accordance with Google&apos;s privacy policy. We do not
            control Google&apos;s data practices; please review Google&apos;s privacy policy for more information.
          </p>
        </section>

        <section className="legal-section">
          <h2>User Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access and download the data we hold about you</li>
            <li>Correct or update your account and financial data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Withdraw consent where applicable</li>
          </ul>
          <p>To exercise these rights, contact us using the information below.</p>
        </section>

        <section className="legal-section">
          <h2>Contact Information</h2>
          <p>
            For privacy-related questions or requests, contact us at:{' '}
            <a href="mailto:support@klaroph.com" className="legal-link">support@klaroph.com</a>.
          </p>
        </section>

        <p className="legal-footer-note">
          <Link href="/" className="legal-link">Return to KlaroPH</Link>
        </p>
      </main>
    </div>
  )
}
