import Link from 'next/link'

const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61579674025898'

function FacebookIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="14" height="14" aria-hidden="true">
      <path fill="#1877F2" d="M256 128C256 57.308 198.692 0 128 0S0 57.308 0 128c0 63.888 46.808 116.843 108 126.445V165H75.5v-37H108V99.8c0-32.08 19.11-49.8 48.348-49.8C170.352 50 185 52.5 185 52.5V84h-16.14C152.959 84 148 93.867 148 103.99V128h35.5l-5.675 37H148v89.445c61.192-9.602 108-62.556 108-126.445" />
      <path fill="#fff" d="m177.825 165 5.675-37H148v-24.01C148 93.866 152.959 84 168.86 84H185V52.5S170.352 50 156.347 50C127.11 50 108 67.72 108 99.8V128H75.5v37H108v89.445A129 129 0 0 0 128 256a129 129 0 0 0 20-1.555V165z" />
    </svg>
  )
}

type FooterProps = { variant?: 'landing' | 'default' }

export default function Footer({ variant = 'default' }: FooterProps) {
  return (
    <footer
      className={`footer footer-variant-${variant}`}
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="footer-inner">
        <div className="footer-columns">
          {/* Column 1 — Brand */}
          <div className="footer-col footer-col-brand">
            <p className="footer-brand-title">KlaroPH</p>
            <p className="footer-brand-tagline">
              Built independently in the Philippines for everyday financial clarity.
            </p>
          </div>

          {/* Column 2 — Social */}
          <div className="footer-col footer-col-social">
            <p className="footer-social-label">Stay connected</p>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-fb-btn"
            >
              <FacebookIcon />
              Facebook
            </a>
          </div>

          {/* Column 3 — Legal links */}
          <div className="footer-col footer-col-legal">
            <Link href="/privacy" className="footer-legal-link">Privacy Policy</Link>
            <Link href="/terms" className="footer-legal-link">Terms of Service</Link>
            <a href="mailto:support@klaroph.com?subject=KlaroPH Inquiry" className="footer-legal-link">Contact Us</a>
          </div>
        </div>

        {/* Bottom legal row */}
        <div className="footer-bottom-row">
          © 2026 KlaroPH. All rights reserved. Established 2025.
        </div>
      </div>
    </footer>
  )
}
