'use client'

import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'

const ARTICLES = [
  {
    title: 'Start with one goal',
    desc: 'Small steps build lasting habits. Pick one financial goal and focus on it before adding more.',
    tag: 'Getting Started',
  },
  {
    title: 'Needs vs wants',
    desc: 'Learn to tell the difference. This simple habit helps you save more and spend wisely.',
    tag: 'Budgeting',
  },
  {
    title: 'Your net worth',
    desc: 'Understanding assets minus liabilities. This single number tells you where you stand financially.',
    tag: 'Fundamentals',
  },
  {
    title: 'The 50/30/20 rule',
    desc: '50% needs, 30% wants, 20% savings. A simple framework to balance your monthly income.',
    tag: 'Budgeting',
  },
  {
    title: 'Emergency fund basics',
    desc: "Aim for 3–6 months of expenses. It's your financial safety net for unexpected events.",
    tag: 'Savings',
  },
  {
    title: 'Track before you optimize',
    desc: "You can't improve what you don't measure. Start logging income and expenses consistently.",
    tag: 'Mindset',
  },
]

export default function LearningPage() {
  return (
    <div className="learning-page premium-page">
      <div className="page-header">
        <div className="min-w-0 flex-1 max-lg:w-full">
          <div className="max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:overflow-visible">
            <h2 className="max-lg:mb-0">Learning</h2>
            <DashboardMobileHeaderLogo />
          </div>
          <p className="max-lg:mt-1 max-lg:text-xs max-lg:leading-snug max-lg:mb-0 max-lg:text-[var(--text-muted,#64748b)]">
            Build your money mindset. Small lessons today lead to lasting financial habits.
          </p>
        </div>
      </div>

      <div className="premium-banner-message">
        <p>Financial literacy is a superpower. The more you learn, the better decisions you&apos;ll make for yourself and your family.</p>
      </div>

      <div
        className="learning-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 20,
        }}
      >
        {ARTICLES.map((article, i) => (
          <div key={i} className="learning-card">
            <span className="learning-card-tag">
              {article.tag}
            </span>
            <h3>{article.title}</h3>
            <p>{article.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
