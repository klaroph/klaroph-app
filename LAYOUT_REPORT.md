# KlaroPH — Layout-Related Code Report

This document consolidates all layout-related TSX and CSS for the KlaroPH dashboard and app shell.

**Last updated:** Dashboard top row 25:75 grid (Goal Momentum + 6-Month Expenses Trend | Monthly Budget Overview), ExpensesTrendChartCard, dashboard one-pager compact styles, card title consistency, Income & Expenses flow.

---

## 1. Root & App Layout (TSX)

### `app/layout.tsx`
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KlaroPH — Financial clarity for every Filipino",
  description: "Track goals, income, and expenses. Build your financial future with confidence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

### `app/dashboard/layout.tsx`
```tsx
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { needsLegalReconsent } from '@/lib/legalConsent'
import DashboardLayoutClient from './DashboardLayoutClient'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/')
  }
  // ... profile/legal/onboarding checks ...
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>
}
```

---

## 2. Dashboard Layout Client (TSX)

### `app/dashboard/DashboardLayoutClient.tsx`
```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/layout/Sidebar'
import MobileQuickActions from '../../components/layout/MobileQuickActions'
import HowKlaroPHWorksModal, { hasSeenOnboarding } from '../../components/onboarding/HowKlaroPHWorksModal'
import FirstTimeFlow, { hasSeenFirstTimeOnboarding } from '../../components/onboarding/FirstTimeFlow'
import UpgradeModal from '../../components/dashboard/UpgradeModal'
import GraceBanner from '../../components/dashboard/GraceBanner'
import NewGoalModal from '../../components/dashboard/NewGoalModal'
import IncomeAllocationModal from '../../components/dashboard/IncomeAllocationModal'
import AddExpenseModal from '../../components/dashboard/AddExpenseModal'
import { SubscriptionProvider } from '@/contexts/SubscriptionContext'
import { UpgradeTriggerProvider, useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'

function UpgradeModalGate() {
  const { isUpgradeModalOpen, closeUpgradeModal } = useUpgradeTrigger()
  return <UpgradeModal isOpen={isUpgradeModalOpen} onClose={closeUpgradeModal} onUpgrade={() => {}} />
}

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [showFirstTime, setShowFirstTime] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [fabGoalOpen, setFabGoalOpen] = useState(false)
  const [fabIncomeOpen, setFabIncomeOpen] = useState(false)
  const [fabExpenseOpen, setFabExpenseOpen] = useState(false)
  // ... onboarding check effect, handleFirstTimeComplete, handleOnboardingClose, closeDrawer ...

  if (!onboardingChecked) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-secondary" style={{ fontSize: 14 }}>Loading...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {showFirstTime ? (
        <FirstTimeFlow onComplete={handleFirstTimeComplete} />
      ) : (
        <SubscriptionProvider>
          <UpgradeTriggerProvider>
            <Sidebar drawerOpen={drawerOpen} onDrawerClose={closeDrawer} />
            <div className="main-wrapper" aria-hidden={drawerOpen}>
              <GraceBanner />
              <button type="button" className="drawer-menu-btn" onClick={() => setDrawerOpen((open) => !open)} aria-label={drawerOpen ? 'Close menu' : 'Open menu'} aria-expanded={drawerOpen} />
              <div className={`drawer-backdrop ${drawerOpen ? 'visible' : ''}`} onClick={closeDrawer} role="button" tabIndex={-1} aria-label="Close menu" />
              <main className="main-content">{children}</main>
              <footer className="dashboard-footer">© 2026 KlaroPH. Established 2025. Developed by JDS.</footer>
            </div>
            <HowKlaroPHWorksModal isOpen={showOnboarding} onClose={handleOnboardingClose} markSeenOnAccept />
            <UpgradeModalGate />
            <MobileQuickActions onAddGoal={() => setFabGoalOpen(true)} onAddIncome={() => setFabIncomeOpen(true)} onAddExpense={() => setFabExpenseOpen(true)} />
            <NewGoalModal isOpen={fabGoalOpen} onClose={...} onGoalCreated={...} />
            <IncomeAllocationModal isOpen={fabIncomeOpen} onClose={...} onSaved={...} initialRecord={null} />
            <AddExpenseModal isOpen={fabExpenseOpen} onClose={...} onSaved={...} />
          </UpgradeTriggerProvider>
        </SubscriptionProvider>
      )}
    </div>
  )
}
```

**Layout structure:** `flex` row → `Sidebar` + `main-wrapper` (flex column: **GraceBanner**, drawer btn, backdrop, **main-content**, footer). Modals and **MobileQuickActions** FAB are siblings of `main-wrapper`.

---

## 3. Sidebar (TSX)

### `components/layout/Sidebar.tsx`
```tsx
'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
// ... KlaroPHHandLogo, UpgradeCTA, SupportModal, NAV_ITEMS, TOOLS_ITEMS ...

export default function Sidebar({ drawerOpen = false, onDrawerClose }: SidebarProps) {
  // ... email, profile, isPro, userName, clarityLevel, renewDate ...
  return (
    <aside className={`sidebar${drawerOpen ? ' drawer-open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-logo">
        <span className="sidebar-logo-inner">
          <KlaroPHHandLogo size={48} variant="onBlue" />
        </span>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={`sidebar-link${isActive(item.href) ? ' active' : ''}`} ...>
            {item.icon}
            <span className="sidebar-link-text">{item.label}</span>
          </Link>
        ))}
        <div className="sidebar-section-title">Tools</div>
        {TOOLS_ITEMS.map((item) => (...))}
        <button type="button" className="sidebar-link" onClick={...}>Support</button>
      </nav>
      <SupportModal ... />
      <div className="sidebar-footer">
        <div className="sidebar-user-block">
          <div className="sidebar-user-name">Hi {userName}</div>
          <div className="sidebar-clarity-badge">Clarity Level – {clarityLevel}</div>
          {isPro && (
            <div className="sidebar-plan-card">
              <span className="sidebar-plan-badge">PRO</span>
              <div className="sidebar-plan-status">...</div>
            </div>
          )}
        </div>
        <div className="sidebar-footer-bottom">
          {email && <p className="sidebar-footer-email">{email}</p>}
          {isFree && <UpgradeCTA variant="compact" />}
          <button type="button" className="sidebar-logout" ...>Log out</button>
        </div>
      </div>
    </aside>
  )
}
```

**Structure:** `sidebar` → `sidebar-logo` (logo **48px**) | `sidebar-nav` (nav links + Tools section + Support) | `sidebar-footer` ( **sidebar-user-block** greeting/Clarity/PRO card | **sidebar-footer-bottom** email, Upgrade CTA, logout). Footer bottom aligns email and logout with the greeting/banner via `padding-left: var(--space-4)` (reset to 0 when collapsed at 1024px).

---

## 4. Dashboard Page (TSX)

### `app/dashboard/page.tsx` (layout-relevant JSX only)
```tsx
return (
  <div className={`dashboard-page${isPro ? ' dashboard-premium' : ''}`} aria-busy={...} role="region" aria-label="Dashboard content">
    <div className="page-header">
      <h2>Dashboard</h2>
      <p>Financial clarity, without complexity.</p>
    </div>
    <ActivationCelebration isPro={isPro} />
    {!isPro && (
      <div className="free-plan-banner" role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span>...</span>
        <UpgradeCTA variant="compact" />
      </div>
    )}
    <div className="dashboard-top-row">
      <div className="dashboard-col-left">
        <GoalMomentumSection ... />
        <div className="dashboard-tools-fill">
          <ExpensesTrendChartCard refreshTrigger={refreshTrigger} />
        </div>
      </div>
      <div className="dashboard-col-budget">
        <BudgetOverview budgetRefreshKey={...} dashboardCard maxCategories={10} breakdownTitle="Top 10 Spending to Watch" />
      </div>
    </div>
    <div className="card dash-card dash-card-no-border">
      <CardHeaderWithAction title="Income & Expenses" titleAs="h3" actions={<><Link ...>Income Page →</Link><Link ...>Expenses Page →</Link></>} />
      <IncomeExpenseFlow refreshTrigger={refreshTrigger} showTitle={false} />
    </div>
    {/* BudgetPlanner, MonthOverrideModal, ManageGoalsModal, NewGoalModal */}
  </div>
)
```

**Section order:** 1) **Page header** (Dashboard + tagline), 2) ActivationCelebration, 3) Free plan banner (optional), 4) **dashboard-top-row** (25:75 grid): left = **Goal Momentum** + **6-Month Expenses Trend** (stacked in `dashboard-col-left`), right = **Monthly Budget Overview**; 5) **Income & Expenses** (single card, `dash-card-no-border`). **dashboard-page** enables one-pager compact styles; **dashboard-premium** adds card elevation for Pro users.

---

## 5. Goal Momentum Section (TSX)

### `components/dashboard/GoalMomentumSection.tsx`
```tsx
return (
  <section className="goal-momentum-executive" aria-labelledby="goal-momentum-heading">
    <CardHeaderWithAction title="Goal Momentum" titleAs="h2" titleId="goal-momentum-heading" actions={<Link href="/dashboard/goals" className="card-outline-link">Goals Page →</Link>} />
    <p className="goal-momentum-executive-encourage" style={{ marginTop: 0, marginBottom: 'var(--space-3)' }}>{encouragement}</p>
    <div className="goal-momentum-executive-body">
      <div className="goal-momentum-executive-stats">
        <div className="goal-momentum-executive-stat">...Total Saved...</div>
        <div className="goal-momentum-executive-stat">...Total Target...</div>
        <div className="goal-momentum-executive-stat">...Active Goals...</div>
      </div>
      <GoalMomentumDonut percent={percent} ariaLabel={...} />
    </div>
  </section>
)
```

### `components/dashboard/GoalMomentumDonut.tsx`
```tsx
return (
  <div className="goal-momentum-donut-wrap" role="img" aria-label={ariaLabel}>
    <svg className="goal-momentum-donut-svg" viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
      <circle className="goal-momentum-donut-track" ... />
      <circle className="goal-momentum-donut-fill" ... />
    </svg>
    <div className="goal-momentum-donut-center">
      <span className="goal-momentum-donut-pct tabular-nums">{Math.round(clamped)}%</span>
    </div>
  </div>
)
```

---

## 6. 6-Month Expenses Trend Card (TSX)

### `components/dashboard/ExpensesTrendChartCard.tsx`
```tsx
return (
  <section className="expenses-trend-chart-card flex flex-col h-full min-h-0 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] overflow-hidden" aria-labelledby="expenses-trend-chart-heading">
    <div className="flex-none flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <h2 id="expenses-trend-chart-heading" className="dashboard-card-title font-semibold m-0 text-[var(--text-primary)]">6-Month Expenses Trend</h2>
      <Link href="/dashboard/expenses" className="card-outline-link dashboard-card-link text-xs">Expenses Page →</Link>
    </div>
    <div className="flex-1 min-h-0 flex flex-col px-4 pb-5">
      <div className="expenses-trend-chart-container flex-none" style={{ height: CHART_HEIGHT_PX, width: '100%' }}>
        <FinancialChart type="line" chartContext="trend" labels={labels} dataset={values} userPlan={...} height={CHART_HEIGHT_PX} />
      </div>
    </div>
  </section>
)
```

**Layout:** Header (title + Expenses Page →) | Chart area (fixed height 200px via `CHART_HEIGHT_PX`). Card fills `dashboard-tools-fill` via flex. Fetches last 6 months of expenses, aggregates by month, renders line chart.

---

## 7. Monthly Budget Overview (TSX)

### `components/dashboard/BudgetOverview.tsx` (dashboard card mode)
When `dashboardCard` is true: compact header (title + "Expenses Page →"), two-column layout (Budget Health donut left | Top 10 Spending to Watch right). Uses `budget-overview-card-equal`, `min-h-[320px]`, `p-6`, `flex flex-col justify-between h-full`.

---

## 8. Focus Goals Section (TSX)

*Note: Focus Goals is not on the main dashboard; it may appear on the goals page or other flows.*

### `components/dashboard/FocusGoalsSection.tsx` (layout-relevant)
```tsx
return (
  <div className="dash-card focus-goals-card">
    <CardHeaderWithAction title="Focus Goals" actions={
      <>{isPro && <a href="/dashboard/goals" className="card-outline-link">Goals Page →</a>}
       {canAdd && <button type="button" className="btn-primary" onClick={onAddGoal}>+ Add New Goal</button>}
       {!isPro && !canAdd && <div className="focus-goals-upgrade-row">...</div>}</>
    } />
    {loading ? <p className="focus-goals-loading">...</p> : focusList.length === 0 ? (...) : (
      <>
        <div className="goals-grid goals-grid-focus">
          {focusList.map((goal) => (
            <button key={goal.id} type="button" className="focus-goal-cell focus-goal-clickable" onClick={...}>
              <MarathonGoal name={...} targetAmount={...} allocatedAmount={...} />
            </button>
          ))}
        </div>
        {goals.length > 3 && <div className="focus-goals-manage-wrap"><button className="focus-goals-manage-link">Manage All Goals →</button></div>}
      </>
    )}
    <GoalQuickAdjustModal ... />
  </div>
)
```

---

## 9. Card Header (TSX)

### `components/cards/CardHeaderWithAction.tsx`
```tsx
return (
  <div className="dash-card-header focus-goals-header">
    <TitleTag id={titleId} className="dash-card-title" style={{ margin: 0 }}>{title}</TitleTag>
    {actions != null && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>
    )}
  </div>
)
```

---

## 10. Income & Expenses Flow (TSX — layout structure only)

### `components/dashboard/IncomeExpenseFlow.tsx` (return JSX)
```tsx
return (
  <div className="income-expense-flow">
    <div className="flow-header-and-filters">
      {showTitle && <h3 className="dash-card-title">Income & Expenses</h3>}
      <div className="flow-filter-row">
        <div className="flow-filter-buttons">{/* period buttons */}</div>
        {period === 'custom' && <div className="flow-custom-range">...</div>}
        <span className="flow-range-label">{range.start} — {range.end}</span>
      </div>
    </div>
    {loading ? <div className="flow-loading">Loading...</div> : (
      <div className="flow-three-col">
        <div className="flow-col flow-col-snapshot">
          <div className="flow-snapshot-card flow-snapshot-income">...</div>
          <div className="flow-snapshot-card flow-snapshot-expense">...</div>
          <div className="flow-snapshot-card flow-snapshot-net positive|negative">...</div>
        </div>
        <div className="flow-col flow-col-income">...</div>
        <div className="flow-col flow-col-expense">...</div>
      </div>
    )}
  </div>
)
```

---

## 11. Income & Expenses Pages (TSX — layout and charts)

### `app/dashboard/income/page.tsx` / `app/dashboard/expenses/page.tsx` (layout-relevant)
- **Page header:** `page-header` with title (Income / Expenses), tagline `<p>`, and optional export button.
- **Row 1:** Summary grid (`income-expense-summary-grid`: 3 summary cards + filters card); on mobile single column.
- **Row 2:** Two-column layout `income-expense-two-col` (2fr 3fr); on mobile single column.
  - **Left column** `income-expense-left-col`:
    - **Trend section** `income-expense-trend-section` (cardStyle): header + chart type select + **chart wrapper**:
      - `<div className="income-expense-chart-wrapper">` → `<FinancialChart chartContext="trend" height={220} />`
    - **Category section** `income-expense-category-section` (By Source / By Category): CardHeaderWithAction + **chart wrapper**:
      - `<div className="income-expense-chart-wrapper" style={{ flexShrink: 0, marginBottom: 12 }}>` → `<FinancialChart chartContext="category" height={200} />`
      - Then total line + scrollable breakdown list.
  - **Right column:** Table card `income-expense-table-card`.

**Charts:** Wrapped in `income-expense-chart-wrapper` (width 100%, min-width 0, overflow hidden; on mobile overflow visible). No fixed pixel widths; charts rely on container width. Mobile chart height is 300px (see FinancialChart).

---

## 12. FinancialChart (TSX — Chart.js, responsive)

### `components/charts/FinancialChart.tsx`
- **Library:** Chart.js via `react-chartjs-2` (Line, Bar, Pie, Doughnut, Radar). Not Recharts.
- **Props:** `type`, `labels`, `dataset` / `datasets`, `userPlan`, `title`, `height` (default 280), `chartContext` ('trend' | 'category').
- **Responsive height:** `useLayoutEffect` + `window.innerWidth`: below **768px** uses **300px** (`MOBILE_CHART_HEIGHT`), else uses `height` prop. Prevents vertical clipping on mobile.
- **Container:** Root uses `className="financial-chart-container"` and inline style:
  - `width: '100%'`, `minWidth: 0`, `overflow: 'hidden'`, `height: effectiveHeight`, `position: 'relative'`.
  - On mobile (CSS override): `.financial-chart-container { overflow: visible !important; }` so pie legend / line chart are not clipped.
- **Inner:** `FinancialChartInner` renders Line/Bar/Pie/Doughnut/Radar with `maintainAspectRatio: false` and `style={{ height: effectiveHeight }}`.

---

## 13. Alternate Dashboard Layout (TSX)

### `components/layout/DashboardLayout.tsx`
Used for non-main-dashboard flows (e.g. some tools); centered max-width container.
```tsx
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', fontFamily: '...' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 48px' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)', overflow: 'hidden', padding: '28px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
```

---

## 14. Layout-Related CSS (globals.css)

### 12.1 Design tokens (layout / spacing)
```css
:root {
  --sidebar-width: 240px;
  --sidebar-width-collapsed: 64px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
}
```

### 12.2 Overflow & mobile simplification (≤768px)
```css
html, body { overflow-x: hidden; }

@media (max-width: 768px) {
  .financial-tools-section { display: none !important; }
  .dashboard-top-row {
    grid-template-columns: 1fr; gap: var(--space-5);
  }
  .dashboard-col-left, .dashboard-col-budget {
    width: 100%; max-width: 100%; min-width: 0;
  }
  .goal-momentum-executive, .focus-goals-card, .card.dash-card {
    width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;
  }
  .card.dash-card { margin-top: var(--space-6); }
  .dash-card-header { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .dash-card-header > div:last-child {
    display: flex !important; flex-direction: column !important;
    align-items: stretch !important; gap: var(--space-4) !important; width: 100%;
  }
  .dash-card-header .card-outline-link, .dash-card-header .btn-primary {
    width: 100%; justify-content: center; box-sizing: border-box;
  }
  .free-plan-banner { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
  .main-wrapper { width: 100%; }
}
```

### 12.3 Main wrapper & content
```css
.main-wrapper {
  flex: 1; display: flex; flex-direction: column; min-height: 100vh;
  min-width: 0; max-width: 100%;
}
.main-content {
  margin-left: 0; flex: 1; min-height: 0; padding: var(--space-5);
  max-width: 100%; min-width: 0;
}
.dashboard-footer { flex-shrink: 0; text-align: center; ... }

@media (max-width: 768px) { .main-content { padding: var(--space-4); } }
@media (max-width: 480px) { .main-content { padding: var(--space-3); } }
```

### 12.4 Sidebar (desktop + 1024 + 768)
```css
.sidebar {
  position: relative;
  width: var(--sidebar-width);
  min-height: 100vh;
  background: var(--color-blue);
  color: var(--text-inverse);
  display: flex; flex-direction: column; overflow-y: auto;
}
.sidebar-logo { display: flex; align-items: center; justify-content: flex-start; padding: var(--space-3) var(--space-3) var(--space-3) 28px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.sidebar-logo a, .sidebar-logo span { display: block; max-width: 100%; }
.sidebar-logo img {
  max-height: 48px;
  width: auto; max-width: 100%; object-fit: contain; object-position: left center;
}
.sidebar-nav { flex: 1; padding: var(--space-4) var(--space-3); display: flex; flex-direction: column; gap: 4px; }
.sidebar-link { display: flex; align-items: center; gap: var(--space-3); padding: 8px 16px; min-height: 38px; ... }
.sidebar-link-text { white-space: nowrap; }
.sidebar-footer { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.1); }
.sidebar-user-block { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; margin-bottom: var(--space-2); border-bottom: 1px solid rgba(255,255,255,0.1); }
.sidebar-footer-bottom { padding-left: var(--space-4); }
.sidebar-footer-email { font-size: var(--text-small); color: rgba(255,255,255,0.6); margin: 0 0 var(--space-2); word-break: break-all; }
.sidebar-logout { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4) var(--space-2) 0; min-height: 44px; width: 100%; ... }

@media (max-width: 1024px) {
  .sidebar { width: var(--sidebar-width-collapsed); }
  .sidebar-logo img { max-height: 48px; }
  .sidebar-link-text { position: absolute; width: 1px; height: 1px; ... clip: rect(0,0,0,0); }
  .sidebar-user-block, .sidebar-footer-email { display: none; }
  .sidebar-footer-bottom { padding-left: 0; }
  .sidebar-footer { padding: var(--space-2); }
  .sidebar-logout { justify-content: center; padding: var(--space-3); }
}
@media (max-width: 768px) {
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: var(--sidebar-width); transform: translateX(-100%); transition: ...; z-index: 50; }
  .sidebar.drawer-open { transform: translateX(0); }
  .sidebar-link-text { position: static; ... }
  .sidebar-footer-email { display: block; }
  .sidebar-link { justify-content: flex-start; padding: var(--space-3) var(--space-4); }
  .sidebar-logout { justify-content: flex-start; padding: var(--space-2) var(--space-4) var(--space-2) 0; }
  .sidebar-logo img { max-height: 60px; }
  .main-content { padding: var(--space-4); }
}
```

### 12.5 Drawer backdrop & menu button
```css
.drawer-backdrop {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 40;
}
@media (max-width: 768px) {
  .drawer-backdrop.visible { display: block; }
}
.drawer-menu-btn {
  display: none; position: fixed; top: var(--space-3); left: var(--space-3); z-index: 45;
  width: 44px; height: 44px; min-width: 44px; min-height: 44px;
  padding: 0; border: none; border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text-primary); cursor: pointer;
  align-items: center; justify-content: center; box-shadow: var(--shadow-md);
}
@media (max-width: 768px) { .drawer-menu-btn { display: flex; } }
```

### 12.6 Dashboard top row (25:75 grid)
```css
.dashboard-top-row {
  display: grid;
  grid-template-columns: 25% 75%;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  align-items: stretch;
}
.dashboard-col-left {
  min-width: 0; min-height: 0; height: 100%;
  display: flex; flex-direction: column; gap: var(--space-4);
}
.dashboard-tools-fill {
  flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;
}
.dashboard-tools-fill .expenses-trend-chart-card {
  flex: 1 1 0; min-height: 0 !important; height: 100%;
}
.dashboard-col-budget {
  min-width: 0; min-height: 0; height: 100%;
  display: flex; flex-direction: column;
}
.dashboard-col-budget > * { flex: 1 1 auto; min-height: 280px; }

@media (max-width: 1024px) {
  .dashboard-top-row { grid-template-columns: 1fr; gap: var(--space-5); }
  .dashboard-col-budget { order: 2; }
}
```

### 12.7 Dashboard page container (premium, no outer border)
```css
.dashboard-premium {
  position: relative;
}
.dashboard-premium .dash-card {
  box-shadow: var(--shadow-sm), 0 2px 12px rgba(0, 56, 168, 0.06);
}
@media (prefers-reduced-motion: no-preference) {
  .dashboard-premium .dash-card:hover {
    box-shadow: var(--shadow-md), 0 4px 16px rgba(0, 56, 168, 0.08);
  }
}
```
No gradient border or rounded frame on the dashboard content area; only inner cards get elevation.

### 12.7 6-Month Expenses Trend card
```css
.expenses-trend-chart-container .financial-chart-container {
  width: 100%; height: 100% !important; min-height: 0; overflow: visible;
}
.expenses-trend-chart-container canvas { max-height: 200px; }
```

### 12.8 Dashboard one-pager (`.dashboard-page` compact styles)
Tighter spacing and font sizes for 100% zoom: page header, top row gap, goal momentum, budget overview, flow filters/tables. Card titles use `calc(var(--text-h2) * 0.85)`.

### 12.9 Page header
```css
.page-header { margin-bottom: var(--space-5); }
.page-header h2 { margin: 0 0 var(--space-2); font-size: var(--text-h1); font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
.page-header p { margin: 0; font-size: var(--text-body); color: var(--text-secondary); }
```

### 12.10 Goal Momentum (donut + stats)
```css
.goal-momentum-executive {
  display: flex; flex-direction: column; padding: var(--space-4);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
}
.goal-momentum-executive-header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
.goal-momentum-executive-title { margin: 0; font-size: var(--text-h2); font-weight: 600; color: var(--text-primary); }
.goal-momentum-executive-body { display: flex; align-items: center; gap: var(--space-5); }
.goal-momentum-donut-wrap { position: relative; width: 160px; height: 160px; flex-shrink: 0; aspect-ratio: 1; }
.goal-momentum-donut-svg { width: 100%; height: 100%; transition: stroke-dashoffset var(--motion-medium) var(--ease-enter); }
.goal-momentum-donut-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.goal-momentum-executive-stats { display: flex; flex-direction: column; gap: var(--space-3); flex: 1; min-width: 0; }
.goal-momentum-executive-stat { display: flex; flex-direction: column; gap: 2px; }

@media (max-width: 768px) {
  .goal-momentum-executive-body { flex-direction: column; align-items: center; }
  .goal-momentum-executive-stat:nth-child(2), .goal-momentum-executive-stat:nth-child(3) { display: none; }
  .goal-momentum-donut-wrap { width: min(140px, 40vw); height: min(140px, 40vw); max-height: none; }
  .goal-momentum-donut-pct { font-size: clamp(20px, 5vw, var(--text-h2)); }
  .goal-momentum-executive-stats { text-align: center; align-items: center; }
  .goal-momentum-executive-encourage { text-align: center; }
}
```

### 12.11 Focus Goals & goals grid
```css
.goals-grid-focus { grid-template-columns: 1fr; gap: var(--space-4); padding: 0; min-width: 0; }
@media (max-width: 768px) { .goals-grid-focus { gap: var(--space-5); } }
.focus-goals-manage-wrap { margin-top: var(--space-3); }
.focus-goals-manage-link { display: inline-flex; align-items: center; min-height: 36px; ... }
.focus-goals-card { margin-bottom: 0; padding: 20px; }
.focus-goals-header { flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: var(--space-3); }
.focus-goals-header .btn-primary { padding: var(--space-1) var(--space-4); min-height: 36px; font-size: var(--text-small); }

.goals-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); padding: 0 var(--space-1); }
@media (max-width: 900px) { .goals-grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) { .goals-grid { gap: var(--space-5); } }
```

### 12.12 Cards & KPI grid
```css
.card { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 16px; box-shadow: var(--shadow-sm); padding: var(--space-5); }
.dash-card { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 16px; box-shadow: var(--shadow-sm); padding: var(--space-5); min-width: 0; }
.card.dash-card.dash-card-no-border, .dash-card.dash-card-no-border { border: none; }
.dash-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.dash-card-title { margin: 0; font-size: var(--text-h3); font-weight: 600; color: var(--color-text-primary); }
.dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-5); }

.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); min-width: 0; }
@media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .kpi-grid { grid-template-columns: 1fr; } }
```

### 12.13 Income / Expense flow layout
```css
.income-expense-flow { min-width: 0; }
.flow-header-and-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 16px 24px; margin-bottom: 16px; }
.flow-filter-row { align-items: center; justify-content: space-between; ... }
.flow-filter-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.flow-three-col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-5);
  margin-top: 0;
  min-width: 0;
}
@media (max-width: 1024px) { .flow-three-col { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .flow-three-col { grid-template-columns: 1fr; } }
.flow-col { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; min-width: 0; }
.flow-col-snapshot { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.flow-snapshot-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
.flow-table-scroll { max-height: 280px; overflow-y: auto; overflow-x: hidden; }
```

### 12.14 Income & Expenses pages — grid, two-col, chart wrapper
```css
.income-expense-page { display: block; }
.income-expense-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}
.income-expense-two-col {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 20px;
}
.income-expense-left-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.income-expense-breakdown-scroll {
  flex: 1; min-height: 0; overflow-y: auto; max-height: 320px;
}
.income-expense-table-card { max-height: 520px; }
.income-expense-table-card > div:last-child { flex: 1; min-height: 0; overflow: auto; }
.income-expense-category-section { overflow: hidden; }

/* Chart wrapper: prevent horizontal overflow, rely on container width */
.income-expense-chart-wrapper {
  width: 100%;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

@media (max-width: 768px) {
  .income-expense-summary-grid { grid-template-columns: 1fr; gap: var(--space-4); margin-bottom: var(--space-4); }
  .income-expense-two-col { grid-template-columns: 1fr; gap: var(--space-4); }
  .income-expense-left-col { gap: var(--space-4); }
  .income-expense-summary-card { min-height: 0; height: auto; }
  .income-expense-filters-card { max-height: none; overflow: visible; }
  .income-expense-breakdown-scroll { max-height: none; overflow-y: visible; flex: none; }
  .income-expense-table-card { max-height: none; }
  .income-expense-table-card > div:last-child { overflow: visible; }
  .income-expense-category-section { overflow: visible; }
  .income-expense-trend-section,
  .income-expense-category-section {
    padding: var(--space-4) var(--space-4) var(--space-6) var(--space-4) !important;
  }
  .income-expense-chart-wrapper { overflow: visible; }
  .financial-chart-container { overflow: visible !important; }
}
```

### 12.15 Free plan banner & modal
```css
.free-plan-banner {
  margin-bottom: var(--space-4); padding: var(--space-2) var(--space-4);
  background: var(--color-blue-muted); border: 1px solid rgba(0, 56, 168, 0.2);
  border-radius: var(--radius-sm); font-size: var(--text-small); color: var(--text-primary);
}

.modal-backdrop { padding: var(--space-3); align-items: center; justify-content: center; }
.modal-panel { width: min(95vw, 500px); max-height: min(90vh, calc(100dvh - 32px)); }
.modal-panel-header { flex-shrink: 0; }
.modal-panel-body { overflow-y: auto; -webkit-overflow-scrolling: touch; }
@media (max-width: 768px) {
  .modal-backdrop { padding: var(--space-2); }
  .modal-panel { width: min(95vw, 500px) !important; max-width: min(95vw, 500px) !important; max-height: min(90vh, calc(100dvh - 16px)); }
  .modal-panel-header { padding: var(--space-4) var(--space-3) !important; }
  .modal-panel-body { padding: var(--space-4) var(--space-3) !important; }
}
```

### 12.16 Mobile typography (≤768px)
```css
@media (max-width: 768px) {
  .kpi-value { font-size: 22px; font-weight: 600; }
  .dash-card-title { font-size: var(--text-h3); }
  .goal-momentum-executive-title { font-size: var(--text-h2); }
  .page-header h2 { font-size: var(--text-h2); }
}
```

### 12.17 Overflow safety (numbers)
```css
.flow-snapshot-value, .goal-momentum-executive-value, .kpi-value, .marathon-goal-amount {
  overflow-wrap: break-word; word-break: break-word; min-width: 0;
}
```

---

## 15. File Index

| Purpose | File |
|--------|------|
| Root layout | `app/layout.tsx` |
| Dashboard shell (auth + wrapper) | `app/dashboard/layout.tsx` |
| Dashboard client (sidebar + main + GraceBanner + modals + FAB) | `app/dashboard/DashboardLayoutClient.tsx` |
| Sidebar nav (logo 48px, user block, footer bottom) | `components/layout/Sidebar.tsx` |
| Alt dashboard container | `components/layout/DashboardLayout.tsx` |
| Dashboard page (header, top row 25:75, Income & Expenses) | `app/dashboard/page.tsx` |
| Goal Momentum block | `components/dashboard/GoalMomentumSection.tsx` |
| Donut chart | `components/dashboard/GoalMomentumDonut.tsx` |
| 6-Month Expenses Trend card | `components/dashboard/ExpensesTrendChartCard.tsx` |
| Monthly Budget Overview | `components/dashboard/BudgetOverview.tsx` |
| Focus Goals block | `components/dashboard/FocusGoalsSection.tsx` |
| Section header (title + actions) | `components/cards/CardHeaderWithAction.tsx` |
| Income & Expenses block (dashboard) | `components/dashboard/IncomeExpenseFlow.tsx` |
| Income page (summary, trend chart, By Source chart) | `app/dashboard/income/page.tsx` |
| Expenses page (summary, trend chart, By Category chart) | `app/dashboard/expenses/page.tsx` |
| Charts (Chart.js, responsive height, wrapper class) | `components/charts/FinancialChart.tsx` |
| All layout & dashboard CSS | `app/globals.css` |

---

*Generated for KlaroPH. Layout only; excludes business logic, API routes, and non-layout styling.*
