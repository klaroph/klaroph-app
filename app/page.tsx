'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import HowKlaroPHWorksModal from '../components/onboarding/HowKlaroPHWorksModal'
import KlaroPHHandLogo from '../components/ui/KlaroPHHandLogo'
import SignUpModal from '../components/auth/SignUpModal'
import PlanFeaturePremiumIcon from '../components/ui/PlanFeaturePremiumIcon'
import {
  FREE_PLAN_FEATURES,
  FREE_PLAN_TOOLS,
  PRO_PLAN_FEATURES,
  PRO_PLAN_TOOLS,
  PLAN_SECTION_TOOLS_LABEL,
} from '../lib/planFeatures'

const HERO_HEADLINE = 'Take Control of Your Money with Financial Clarity.'
const HERO_SUBHEADLINE = 'Track income, expenses, and goals in one simple dashboard.'
const EMOTIONAL_TAGLINE = 'Finally understand where your money goes.'

const FEATURES = [
  {
    title: 'Smart Trend Analytics',
    desc: 'Track income and expenses patterns with visual clarity.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    title: 'Goal Tracking That Motivates',
    desc: 'Set financial goals and watch your progress build momentum.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
  },
  {
    title: 'Essential Financial Calculators (Free)',
    desc: 'Financial Health Check, Salary calculator, 13th month pay and Loan estimator.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" />
      </svg>
    ),
  },
  {
    title: 'Advanced Analytics & Export (Pro)',
    desc: 'Unlimited history, CSV export, and advanced trends for serious trackers.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25M12 20.25v-2.25m0-13.5v-2.25M21 16.5v-2.25M19.5 21l-2.25-2.25M4.5 3L2.25 4.5m15 0L19.5 3m-15 13.5L4.5 21m15-15l2.25-2.25M19.5 3v2.25" />
      </svg>
    ),
  },
]

const HOW_STEPS = [
  { title: 'Add income & expenses', icon: '📥' },
  { title: 'Set your goals', icon: '🎯' },
  { title: 'Track your financial clarity', icon: '📊' },
]

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [showSignUpModal, setShowSignUpModal] = useState(false)
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false)
  const [showGoogleConsentModal, setShowGoogleConsentModal] = useState(false)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard')
      }
    }
    checkSession()
  }, [router])

  useEffect(() => {
    if (!showGoogleConsentModal) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGoogleConsentModal(false)
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [showGoogleConsentModal])

  const scrollToGetStarted = () => {
    document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e?.preventDefault?.()
    setError(null)
    setSuccess(null)
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    router.replace('/dashboard')
  }

  const triggerGoogleOAuth = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL is required for OAuth redirect safety.')
    }
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${baseUrl}/auth/callback` },
    })
  }

  const handleGoogleLogin = (e: React.MouseEvent) => {
    e.preventDefault()
    setError(null)
    if (hasAcceptedTerms) {
      triggerGoogleOAuth()
      return
    }
    setShowGoogleConsentModal(true)
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <a href="/" className="landing-nav-brand">
          <KlaroPHHandLogo size={56} variant="onBlue" />
        </a>
        <div className="landing-nav-links">
          <div className="landing-nav-links-primary">
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#how" className="landing-nav-link">How it works</a>
            <button type="button" className="landing-nav-link landing-nav-link-btn" onClick={() => setShowHowItWorks(true)}>
              Purpose
            </button>
          </div>
          <a href="#login" className="landing-nav-link">Sign In</a>
        </div>
      </nav>

      {/* Hero: two-column */}
      <section className="landing-hero landing-hero-saas">
        <div className="landing-hero-inner">
          <div className="landing-hero-left">
            <h1 className="landing-hero-headline">{HERO_HEADLINE}</h1>
            <p className="landing-hero-subheadline">{HERO_SUBHEADLINE}</p>
            <div className="landing-hero-ctas">
              <button type="button" className="landing-cta-btn landing-cta-primary" onClick={scrollToGetStarted}>Get Started</button>
              <button type="button" className="landing-cta-btn landing-cta-secondary" onClick={() => setShowHowItWorks(true)}>
                See How It Works
              </button>
            </div>
          </div>
          <div className="landing-hero-right">
            <div className="landing-dashboard-mock" role="img" aria-label="Dashboard preview: monthly overview with income, expenses, and goal progress">
              <div className="landing-mock-header">Monthly Overview – March</div>
              <div className="landing-mock-summary-cards">
                <div className="landing-mock-summary-card">
                  <span className="landing-mock-card-label">Income</span>
                  <span className="landing-mock-card-value landing-mock-value-income">₱52,340</span>
                </div>
                <div className="landing-mock-summary-card">
                  <span className="landing-mock-card-label">Expenses</span>
                  <span className="landing-mock-card-value landing-mock-value-expense">₱38,200</span>
                </div>
                <div className="landing-mock-summary-card">
                  <span className="landing-mock-card-label">Net Savings</span>
                  <span className="landing-mock-card-value landing-mock-value-savings">₱14,140</span>
                </div>
              </div>
              <div className="landing-mock-chart">
                <div className="landing-mock-chart-bar" style={{ height: '45%' }} />
                <div className="landing-mock-chart-bar" style={{ height: '70%' }} />
                <div className="landing-mock-chart-bar" style={{ height: '55%' }} />
                <div className="landing-mock-chart-bar landing-mock-chart-bar-tall" style={{ height: '90%' }} />
              </div>
              <div className="landing-mock-goal">
                <div className="landing-mock-goal-label">Emergency Fund</div>
                <div className="landing-mock-progress-track">
                  <div className="landing-mock-progress-fill" style={{ width: '65%' }} />
                </div>
                <div className="landing-mock-goal-text">₱65,000 / ₱100,000</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features: 4 blocks — 3 cols desktop, 2 tablet, 1 mobile */}
      <section id="features" className="landing-features">
        <h2 className="landing-features-title">Everything you need for financial clarity</h2>
        <p className="landing-features-subtitle">
          Simple, powerful tools designed for every Filipino to track, plan, and grow.
        </p>
        <div className="landing-features-grid landing-features-responsive">
          {FEATURES.map((f, i) => (
            <div key={i} className="landing-feature-card">
              <div className="landing-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works: 3 steps */}
      <section id="how" className="landing-how">
        <h2 className="landing-how-title">How it works</h2>
        <div className="landing-how-steps">
          {HOW_STEPS.map((step, i) => (
            <div key={i} className="landing-how-step">
              <span className="landing-how-icon" aria-hidden="true">{step.icon}</span>
              <span className="landing-how-num">{i + 1}</span>
              <h3>{step.title}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* Free vs Pro — consistent with Upgrade modal */}
      <section className="landing-compare">
        <h2 className="landing-compare-title">Free vs Pro</h2>
        <div className="landing-compare-grid">
          <div className="landing-plan-card">
            <h3>FREE PLAN</h3>
            <p className="plan-section-title">Core</p>
            <ul>
              {FREE_PLAN_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="plan-section-title plan-section-tools">{PLAN_SECTION_TOOLS_LABEL}</p>
            <ul>
              {FREE_PLAN_TOOLS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="landing-plan-card landing-plan-pro">
            <span className="landing-plan-badge">Most Popular</span>
            <h3>PRO PLAN</h3>
            <p className="landing-plan-price">₱149<span>/month</span></p>
            <p className="landing-plan-value">Less than ₱5 per day.</p>
            <p className="plan-section-title">Core</p>
            <ul>
              {PRO_PLAN_FEATURES.map(({ label, premium }) => (
                <li key={label}>
                  {premium ? (
                    <span className="plan-feature-premium">
                      <PlanFeaturePremiumIcon />
                      {label}
                    </span>
                  ) : (
                    label
                  )}
                </li>
              ))}
            </ul>
            <p className="plan-section-title plan-section-tools">{PLAN_SECTION_TOOLS_LABEL}</p>
            <ul>
              {PRO_PLAN_TOOLS.map(({ label, premium }) => (
                <li key={label}>
                  {premium ? (
                    <span className="plan-feature-premium">
                      <PlanFeaturePremiumIcon />
                      {label}
                    </span>
                  ) : (
                    label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-final-cta">
        <h2 className="landing-final-headline">{EMOTIONAL_TAGLINE}</h2>
        <p className="landing-final-sub">Start building financial clarity today.</p>
        <button type="button" className="landing-cta-btn landing-cta-primary landing-cta-large" onClick={scrollToGetStarted}>
          Create Free Account
        </button>
        <div className="landing-final-checks">
          <span>✔ No credit card required</span>
          <span>✔ Built for Filipinos</span>
        </div>
      </section>

      {/* Login Section */}
      <section id="login" className="landing-login">
        <h2 className="landing-login-title">Get started today</h2>
        <p className="landing-login-subtitle">Sign in to your account or create a new one</p>

        <div className="login-card">
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label htmlFor="login-email" style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Email</label>
              <input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="login-password" style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Password</label>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="login-input"
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--color-error)', padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-error-bg)' }}>{error}</p>
            )}
            {success && (
              <p role="status" style={{ margin: 0, fontSize: 14, color: 'var(--color-success)', padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-muted)' }}>{success}</p>
            )}
            <button type="submit" disabled={loading} className="login-btn-primary">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowSignUpModal(true)}
            className="login-btn-secondary"
          >
            Create Free Account
          </button>

          <div className="login-divider">or continue with</div>

          <button type="button" onClick={handleGoogleLogin} className="login-google">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </section>

      <footer className="landing-footer">
        <p style={{ margin: 0 }}><strong>KlaroPH</strong> &mdash; Financial clarity for every Filipino</p>
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>
          <a href="/privacy" className="landing-footer-legal">Privacy Policy</a>
          {' | '}
          <a href="/terms" className="landing-footer-legal">Terms &amp; Conditions</a>
        </p>
        <button type="button" className="landing-footer-how" onClick={() => setShowHowItWorks(true)}>How KlaroPH works</button>
      </footer>

      <HowKlaroPHWorksModal isOpen={showHowItWorks} onClose={() => setShowHowItWorks(false)} markSeenOnAccept={false} />
      <SignUpModal isOpen={showSignUpModal} onClose={() => setShowSignUpModal(false)} />

      {showGoogleConsentModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="consent-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-modal-title"
            onClick={() => setShowGoogleConsentModal(false)}
          >
            <div className="consent-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="consent-modal-title">Terms &amp; Privacy</h3>
              <p>By continuing, you agree to our Terms &amp; Conditions and Privacy Policy.</p>
              <div className="consent-actions">
                <button type="button" className="consent-btn consent-btn-secondary" onClick={() => setShowGoogleConsentModal(false)}>
                  Cancel
                </button>
                <button type="button" className="consent-btn consent-btn-primary" onClick={() => { setShowGoogleConsentModal(false); triggerGoogleOAuth(); }}>
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
