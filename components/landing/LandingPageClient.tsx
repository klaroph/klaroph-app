'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image, { getImageProps } from 'next/image'
import Link from 'next/link'
import { createPortal, preload } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import KlaroPHHandLogo from '../../components/ui/KlaroPHHandLogo'
import Footer from '../../components/Footer'
import PlanFeaturePremiumIcon from '../../components/ui/PlanFeaturePremiumIcon'
import {
  FREE_PLAN_FEATURES,
  FREE_PLAN_TOOLS,
  PRO_PLAN_FEATURES,
  PRO_PLAN_TOOLS,
  PLAN_SECTION_TOOLS_LABEL,
} from '../../lib/planFeatures'
import { PRO_ANNUAL_PESOS, PRO_MONTHLY_PESOS, formatPlanPeso } from '@/lib/planPricing'
import { LandingPromoCodeCapture } from './LandingPromoCodeCapture'
import PasswordInput from '@/components/auth/PasswordInput'
import { KLARO_ICONS, KlaroFlow, PrincipleCard, type KlaroTone } from '../brand/KlaroBrand'
import heroWebImage from '@/public/web.png'
import heroMobileImage from '@/public/mobile.png'

const HowKlaroPHWorksModal = dynamic(
  () => import('../../components/onboarding/HowKlaroPHWorksModal'),
  { ssr: false }
)

const SignUpModal = dynamic(
  () => import('../../components/auth/SignUpModal'),
  { ssr: false }
)

const AddToHomeScreenModal = dynamic(
  () => import('../../components/landing/AddToHomeScreenModal'),
  { ssr: false }
)
const ForgotPasswordModal = dynamic(
  () => import('../../components/auth/ForgotPasswordModal'),
  { ssr: false }
)

const HERO_EYEBROW = 'Financial clarity for Filipinos'
const HERO_SUBHEADLINE =
  'Track expenses, plan ahead, and see the full picture — in one calm dashboard built around how Filipinos earn, spend, save, and grow.'
const EMOTIONAL_TAGLINE = 'Finally understand where your money goes.'

const FEATURES: { title: string; desc: string; tone: KlaroTone; icon: React.ReactNode }[] = [
  {
    title: 'Budget Clarity',
    tone: 'sun',
    desc: 'Set a monthly spending plan and see what is left in each category at a glance.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
      </svg>
    ),
  },
  {
    title: 'Income & Expense Tracking',
    tone: 'lavender',
    desc: 'Record where your money comes from and where it goes, with clear monthly trends.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    title: 'Goal Tracking That Motivates',
    tone: 'mint',
    desc: 'Set financial goals and watch your progress build momentum.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
  },
  {
    title: 'Essential Financial Calculators (Free)',
    tone: 'sky',
    desc: 'Salary calculator, 13th month pay and Loan estimator.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" />
      </svg>
    ),
  },
  {
    title: 'Financial Health',
    tone: 'mint',
    desc: 'A simple check-in on how your savings, spending, and cash flow are holding up.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
      </svg>
    ),
  },
  {
    title: 'Klaro Insight',
    tone: 'sky',
    desc: 'A short, plain-language observation about your month, based on your KlaroPH numbers.',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={28} height={28}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
]

const ASK_KLARO_POINTS = [
  'Ask about your budget, spending, goals, and net worth in plain language',
  'Follow up naturally — compare months or dig into a category',
  'Explore “what if” scenarios, like a new loan, without changing your records',
]

const TRUST_POINTS = [
  {
    title: 'Built on what you track',
    desc: 'KlaroPH works with the income, expenses, budgets, and goals you record in your account.',
  },
  {
    title: 'Numbers you can check',
    desc: 'Totals and budgets are calculated from your KlaroPH records — the AI explains them, it does not make them up.',
  },
  {
    title: 'Honest about its limits',
    desc: 'Ask Klaro is in beta and only answers using what is in KlaroPH. It is not a financial advisor.',
  },
]

const HOW_PRINCIPLES: { step: string; tone: KlaroTone; title: string; copy: string; icon: React.ReactNode }[] = [
  {
    step: 'Earn',
    tone: 'sky',
    title: 'Know what comes in.',
    copy: 'Salary, side hustle, business, or allowance — log all the money coming in, so your plan starts from real numbers.',
    icon: KLARO_ICONS.earn,
  },
  {
    step: 'Plan',
    tone: 'sun',
    title: 'Give every peso a purpose.',
    copy: 'Set a monthly spending plan and goals before the money slips away — savings first, not leftovers.',
    icon: KLARO_ICONS.purpose,
  },
  {
    step: 'Spend',
    tone: 'lavender',
    title: 'Track without the guilt.',
    copy: 'See where your money goes, spot patterns, and stay within your plan. Clarity, not judgment.',
    icon: KLARO_ICONS.spend,
  },
  {
    step: 'Grow',
    tone: 'mint',
    title: 'Build momentum.',
    copy: 'Watch goals, savings, and financial health improve month after month.',
    icon: KLARO_ICONS.grow,
  },
]

/**
 * Must match what KlaroPHHandLogo renders for the login overlay (size 36, onWhite) so the
 * preloaded response is the same srcset candidate. The overlay only mounts as sign-in navigates
 * away, and iOS WebKit shows a broken-image glyph if that first fetch is cancelled mid-flight.
 */
const { props: loginOverlayLogo } = getImageProps({
  src: '/logo-klaroph-blue.png',
  alt: '',
  width: 130,
  height: 36,
  sizes: '(max-width: 900px) 120px, 202px',
})

export default function LandingPageClient() {
  preload(loginOverlayLogo.src, {
    as: 'image',
    imageSrcSet: loginOverlayLogo.srcSet,
    imageSizes: loginOverlayLogo.sizes,
  })
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  /** submitting: password request in flight; welcome: auth succeeded, navigating to Dashboard; oauth: redirecting to Google. */
  const [loginPhase, setLoginPhase] = useState<'idle' | 'submitting' | 'welcome' | 'oauth'>('idle')
  const loginInFlightRef = useRef(false)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [showSignUpModal, setShowSignUpModal] = useState(false)
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false)
  const [showGoogleConsentModal, setShowGoogleConsentModal] = useState(false)
  const [googleConsentChecked, setGoogleConsentChecked] = useState(false)
  const [showAddToHomeModal, setShowAddToHomeModal] = useState(false)
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false)
  const [hasInstallPrompt, setHasInstallPrompt] = useState(false)
  const [showPwaInNav, setShowPwaInNav] = useState(false)
  const deferredPromptRef = useRef<(Event & { prompt: () => Promise<{ outcome: string }> }) | null>(null)

  // Capture beforeinstallprompt globally on mount so it's ready before any modal interaction
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as Event & { prompt: () => Promise<{ outcome: string }> }
      setHasInstallPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => {
      const mobile = window.innerWidth <= 900
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      const android = /Android/i.test(navigator.userAgent)
      setShowPwaInNav(hasInstallPrompt || mobile || ios || android)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [hasInstallPrompt])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('klaroph_legal_consent_given')
    if (stored === 'true') {
      // Defer the state update to avoid cascading re-renders inside the effect.
      setTimeout(() => setHasAcceptedTerms(true), 0)
    }
  }, [])

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

  // Back from Google's page can restore this page from bfcache with the OAuth overlay still showing.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      loginInFlightRef.current = false
      setLoginPhase('idle')
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const openSignUp = () => setShowSignUpModal(true)

  const handleLogin = async (e: React.FormEvent) => {
    e?.preventDefault?.()
    if (loginInFlightRef.current) return
    loginInFlightRef.current = true
    setError(null)
    setSuccess(null)
    setLoginPhase('submitting')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      loginInFlightRef.current = false
      setLoginPhase('idle')
      setError(err.message)
      return
    }
    setLoginPhase('welcome')
    router.replace('/dashboard')
  }

  const triggerGoogleOAuth = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl) {
      throw new Error('NEXT_PUBLIC_APP_URL is required for OAuth redirect safety.')
    }
    if (loginInFlightRef.current) return
    loginInFlightRef.current = true
    setLoginPhase('oauth')
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${baseUrl}/auth/callback` },
    }).then(({ error: err }) => {
      if (err) {
        loginInFlightRef.current = false
        setLoginPhase('idle')
      }
    })
  }

  const handleGoogleLogin = (e: React.MouseEvent) => {
    e.preventDefault()
    setError(null)
    if (hasAcceptedTerms) {
      triggerGoogleOAuth()
      return
    }
    setGoogleConsentChecked(false)
    setShowGoogleConsentModal(true)
  }

  return (
    <div className="landing-page">
      <LandingPromoCodeCapture />
      <a href="#main-content" className="landing-skip-link">Skip to main content</a>
      <nav className="landing-nav">
        <Link href="/" className="landing-nav-brand" aria-label="KlaroPH home">
          <KlaroPHHandLogo size={56} variant="onBlue" priority />
        </Link>
        <div className="landing-nav-links">
          <div className="landing-nav-links-primary">
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#how" className="landing-nav-link">How it works</a>
            <button type="button" className="landing-nav-link landing-nav-link-btn" onClick={() => setShowHowItWorks(true)}>
              Purpose
            </button>
          </div>
          {showPwaInNav && (
            <button
              type="button"
              className="landing-nav-add-home"
              onClick={() => setShowAddToHomeModal(true)}
              aria-label="Quick access to KlaroPH"
            >
              <span className="landing-nav-add-home-icon" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </span>
              <span className="landing-nav-add-home-label landing-nav-add-home-label-desktop">Quick Access</span>
              <span className="landing-nav-add-home-label landing-nav-add-home-label-mobile">Add App</span>
            </button>
          )}
          <a href="#login" className="landing-nav-link landing-nav-signin">Sign In</a>
        </div>
      </nav>

      <main id="main-content" role="main">
        {/* Hero: two-column */}
        <section className="landing-hero landing-hero-saas">
          <div className="landing-hero-inner">
            <div className="landing-hero-left klaro-sun">
              <p className="landing-hero-eyebrow">{HERO_EYEBROW}</p>
              <h1 className="landing-hero-headline" id="landing-hero-heading">
                <span className="landing-hero-headline-line1">Your money,</span>
                <span className="landing-hero-headline-line2">made Klaro.</span>
              </h1>
              <p className="landing-hero-subheadline">{HERO_SUBHEADLINE}</p>
              <KlaroFlow className="landing-hero-flow" />
              <div className="landing-hero-ctas">
                <button type="button" className="landing-cta-btn landing-cta-primary" onClick={openSignUp}>
                  Create Free Account
                </button>
                <Link href="/tools" className="landing-cta-btn landing-cta-secondary">
                  Free calculators
                </Link>
              </div>
              <p className="landing-hero-pwa-helper">Free to start · No credit card required</p>
            </div>
            <div className="landing-hero-right">
              <div className="landing-hero-mock-stack">
                <Image
                  src={heroWebImage}
                  alt="KlaroPH web dashboard showing financial overview"
                  sizes="(max-width: 768px) 340px, (max-width: 900px) 580px, 760px"
                  className="landing-hero-mock-image landing-hero-mock-web"
                  priority
                />
                <Image
                  src={heroMobileImage}
                  alt="KlaroPH mobile app showing financial tracking"
                  sizes="(max-width: 768px) 92px, (max-width: 900px) 156px, 205px"
                  className="landing-hero-mock-image landing-hero-mock-mobile"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* SEO section below hero */}
        <section className="landing-seo-why" aria-label="Why Filipinos Use KlaroPH">
          <div className="landing-seo-why-inner">
            <h2 className="landing-seo-why-title">Why Filipinos Use KlaroPH for Financial Clarity</h2>
            <p className="landing-seo-why-paragraph">
              KlaroPH combines expense tracking, budgeting, salary estimation, loan planning, and financial calculators designed for
              Filipino households and workers. It helps users track expenses, manage budgets, and make everyday money decisions with
              practical financial tools built for the Philippines.
            </p>
          </div>
        </section>

        <section id="how" className="landing-how" aria-labelledby="landing-how-title">
          <p className="landing-section-eyebrow">How KlaroPH works</p>
          <h2 id="landing-how-title" className="landing-how-title">One simple flow for your money.</h2>
          <p className="landing-how-subtitle">
            Every part of KlaroPH follows the same four steps, so each peso always has a direction.
          </p>
          <ol className="landing-how-grid">
            {HOW_PRINCIPLES.map((p) => (
              <PrincipleCard key={p.step} {...p} />
            ))}
          </ol>
        </section>

        <section id="features" className="landing-features">
          <h2 className="landing-features-title">Everything you need for financial clarity</h2>
          <p className="landing-features-subtitle">
            Simple, powerful tools designed for every Filipino to track, plan, and grow.
          </p>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className={`landing-feature-card klaro-tone-${f.tone}`}>
                <div className="landing-feature-head">
                  <span className="landing-feature-icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                </div>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="ask-klaro" className="landing-ask" aria-labelledby="landing-ask-title">
          <div className="landing-ask-inner">
            <div className="landing-ask-copy">
              <p className="landing-section-eyebrow">
                Ask Klaro <span className="landing-beta-badge">Beta</span>
              </p>
              <h2 id="landing-ask-title" className="landing-ask-title">
                Talk to the numbers you already track.
              </h2>
              <p className="landing-ask-lead">
                Ask Klaro is a conversational way to understand the financial information in your
                KlaroPH account.
              </p>
              <ul className="landing-ask-points">
                {ASK_KLARO_POINTS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="landing-ask-note">
                Ask Klaro can only answer using the financial information you track in KlaroPH. It
                explains your numbers — it isn&apos;t a financial advisor.
              </p>
            </div>
            <div className="landing-ask-demo" aria-label="Example Ask Klaro conversation" role="img">
              <div className="landing-ask-bubble landing-ask-bubble--user">
                <span className="landing-ask-bubble-label">You</span>
                Where am I spending the most this month?
              </div>
              <div className="landing-ask-bubble landing-ask-bubble--klaro">
                <span className="landing-ask-bubble-label">Klaro</span>
                Groceries is your biggest category this month, followed by Transportation. Want me to
                compare it with last month?
              </div>
              <div className="landing-ask-bubble landing-ask-bubble--user">
                <span className="landing-ask-bubble-label">You</span>
                What if I take out a loan?
              </div>
              <div className="landing-ask-bubble landing-ask-bubble--klaro">
                <span className="landing-ask-bubble-label">Klaro</span>
                I can estimate that. How much, at what interest rate, and for how many months?
              </div>
            </div>
          </div>
        </section>

        <section className="landing-trust" aria-labelledby="landing-trust-title">
          <h2 id="landing-trust-title" className="landing-trust-title">
            Clarity you can trust
          </h2>
          <div className="landing-trust-grid">
            {TRUST_POINTS.map((t) => (
              <div key={t.title} className="landing-trust-item">
                <h3>{t.title}</h3>
                <p>{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Free Financial Tools — SEO entry points, no signup */}
        <section id="tools" className="landing-tools">
          <h2 className="landing-tools-title">Free Financial Tools for Everyday Decisions</h2>
          <p className="landing-tools-subtitle">Try KlaroPH calculators before creating your account.</p>
          <p className="landing-tools-subtitle" style={{ marginTop: -18 }}>
            Popular financial calculators used by Filipino workers for payroll, borrowing, and salary planning.
          </p>
          <div className="landing-tools-grid">
            <a href="/tools/salary-calculator" className="landing-tool-card">
              <h3>Salary Calculator Philippines</h3>
              <p>Estimate monthly take-home pay using Philippine tax tables, SSS, PhilHealth, and Pag-IBIG contributions, with official government references and payroll context.</p>
              <span className="landing-tool-badge" aria-hidden="true">Uses current PH payroll contribution tables</span>
            </a>
            <a href="/tools/loan-calculator" className="landing-tool-card">
              <h3>Loan Calculator Philippines</h3>
              <p>Estimate monthly amortization, total interest, and repayment planning for personal, car, and housing loans in the Philippines.</p>
            </a>
            <a href="/tools/13th-month-calculator" className="landing-tool-card">
              <h3>13th Month Pay Calculator Philippines</h3>
              <p>Compute simple or prorated 13th month pay using Philippine labor rules, salary basis, and months worked.</p>
            </a>
          </div>
          <div className="landing-tools-hub-wrap">
            <a href="/tools" className="landing-tools-hub-link">
              Explore all financial tools for Filipinos →
            </a>
          </div>
          <p className="landing-tools-cta">No signup required</p>
        </section>

        {/* Free vs Pro — consistent with Upgrade modal */}
        <section id="pricing" className="landing-compare">
          <h2 className="landing-compare-title">Free vs Pro</h2>
          <p className="landing-compare-subtitle">Start free. Upgrade when you want more room to plan.</p>
          <div className="landing-compare-grid">
            <div className="landing-plan-card">
              <h3>FREE PLAN</h3>
              <p className="landing-plan-price">₱0</p>
              <p className="landing-plan-value">Free includes everything you need to start tracking.</p>
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
              <button type="button" className="btn-secondary landing-plan-cta" onClick={openSignUp}>
                Create Free Account
              </button>
            </div>
            <div className="landing-plan-card landing-plan-pro">
              <span className="landing-plan-badge">Most Popular</span>
              <h3>PRO PLAN</h3>
              <p className="landing-plan-price">
                {formatPlanPeso(PRO_MONTHLY_PESOS)}<span>/month</span>
              </p>
              <p className="landing-plan-value">Save more with annual: {formatPlanPeso(PRO_ANNUAL_PESOS)}/year.</p>
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
              <button type="button" className="klaro-upgrade-cta landing-plan-cta" onClick={openSignUp}>
                Start free, then choose Pro
              </button>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="landing-final-cta">
          <h2 className="landing-final-headline">{EMOTIONAL_TAGLINE}</h2>
          <p className="landing-final-sub">Start building financial clarity today.</p>
          <button type="button" className="landing-cta-btn landing-cta-primary landing-cta-large" onClick={openSignUp}>
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
            <form onSubmit={handleLogin} className="login-form">
              <div>
                <label htmlFor="login-email" className="login-field-label">Email</label>
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
                <div className="login-field-label-row">
                  <label htmlFor="login-password" className="login-field-label">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswordModal(true)}
                    className="login-forgot-link"
                    aria-label="Reset your password"
                  >
                    Forgot password?
                  </button>
                </div>
                <PasswordInput
                  id="login-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p role="alert" className="login-alert login-alert--error">
                  {error}
                </p>
              )}
              {success && (
                <p role="status" className="login-alert login-alert--success">
                  {success}
                </p>
              )}
              <button type="submit" disabled={loginPhase !== 'idle'} className="login-btn-primary">
                {loginPhase !== 'idle' ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            {loginPhase !== 'idle' && (
              <div className="login-card-status" role="status" aria-live="polite">
                <KlaroPHHandLogo size={36} className="login-card-status-logo" />
                <p className="login-card-status-text">
                  {loginPhase === 'oauth'
                    ? 'Connecting to Google…'
                    : loginPhase === 'welcome'
                      ? 'Welcome back — getting things ready…'
                      : 'Signing you in…'}
                </p>
              </div>
            )}

            <button type="button" onClick={() => setShowSignUpModal(true)} className="login-btn-secondary">
              Create Free Account
            </button>

            <div className="login-divider">or continue with</div>

            <button type="button" onClick={handleGoogleLogin} disabled={loginPhase !== 'idle'} className="login-google">
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
      </main>

      <Footer variant="landing" />

      {showHowItWorks && (
        <HowKlaroPHWorksModal
          isOpen={showHowItWorks}
          onClose={() => setShowHowItWorks(false)}
        />
      )}
      {showSignUpModal && (
        <SignUpModal isOpen={showSignUpModal} onClose={() => setShowSignUpModal(false)} />
      )}
      {showAddToHomeModal && (
        <AddToHomeScreenModal
          isOpen={showAddToHomeModal}
          onClose={() => setShowAddToHomeModal(false)}
          deferredPromptRef={deferredPromptRef}
        />
      )}
      {showForgotPasswordModal && (
        <ForgotPasswordModal isOpen={showForgotPasswordModal} onClose={() => setShowForgotPasswordModal(false)} />
      )}

      {showGoogleConsentModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="consent-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-modal-title"
            onClick={() => { setShowGoogleConsentModal(false); setGoogleConsentChecked(false); }}
          >
            <div className="consent-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="consent-modal-title">Terms &amp; Privacy</h3>
              <p>
                Before continuing, please confirm that you agree to our{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="login-terms-link">
                  Privacy Policy
                </a>{' '}
                and{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="login-terms-link">
                  Terms &amp; Conditions
                </a>
                .
              </p>
              <label className="consent-checkbox-label">
                <input
                  type="checkbox"
                  checked={googleConsentChecked}
                  onChange={(e) => setGoogleConsentChecked(e.target.checked)}
                  className="consent-checkbox"
                  aria-describedby="consent-checkbox-desc"
                />
                <span id="consent-checkbox-desc">I agree</span>
              </label>
              <div className="consent-actions">
                <button
                  type="button"
                  className="consent-btn consent-btn-secondary"
                  onClick={() => { setShowGoogleConsentModal(false); setGoogleConsentChecked(false); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="consent-btn consent-btn-primary"
                  disabled={!googleConsentChecked}
                  onClick={() => {
                    setShowGoogleConsentModal(false)
                    if (typeof window !== 'undefined') window.localStorage.setItem('klaroph_legal_consent_given', 'true')
                    setHasAcceptedTerms(true)
                    triggerGoogleOAuth()
                  }}
                >
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

