# Phase 1 — Cleanup Report (KlaroPH Prelaunch)

Report only. No deletions in this phase. Each item includes trace evidence.

---

## A. Safe to delete now (zero references confirmed)

These files have **no imports** from any route, layout, or live component tree. Trace evidence: grep over `app/`, `components/`, `lib/`, `hooks/`, `contexts/` for the symbol or path.

| # | File | Trace evidence |
|---|------|----------------|
| 1 | `components/DashboardView.tsx` | No `DashboardView` or path containing `DashboardView` in any `app/**` file. Only self-definition. |
| 2 | `components/layout/DashboardLayout.tsx` | Only imported by `DashboardView.tsx` (dead root). `app/dashboard/layout.tsx` imports `DashboardLayoutClient`, not this. |
| 3 | `components/layout/Header.tsx` | Only imported by `DashboardView.tsx`. |
| 4 | `components/goals/WelcomeSection.tsx` | Only imported by `DashboardView.tsx`. |
| 5 | `components/dashboard/GoalsProgressSection.tsx` | Only imported by `DashboardView.tsx`. |
| 6 | `components/dashboard/IncomeTrendSection.tsx` | Only imported by `DashboardView.tsx`. |
| 7 | `components/dashboard/ExpensesOverviewSection.tsx` | Only imported by `DashboardView.tsx`. |
| 8 | `components/dashboard/LearningSection.tsx` | Only imported by `DashboardView.tsx`. |
| 9 | `components/dashboard/AdProvision.tsx` | Only imported by `DashboardView.tsx`. |
| 10 | `components/dashboard/ManageExpensesModal.tsx` | Only imported by `ExpensesOverviewSection.tsx` (dead tree). |
| 11 | `components/dashboard/PremiumDashboardHeader.tsx` | No import in `app/` or any live component. Definition-only grep. |
| 12 | `components/dashboard/FinancialClarityToolsSection.tsx` | No import in `app/` or any live component. |
| 13 | `components/dashboard/ToolsHeader.tsx` | No import in `app/` or any live component. |
| 14 | `components/dashboard/DashboardTopBar.tsx` | No import in `app/` or any live component. |
| 15 | `components/dashboard/SalaryCalculatorModal.tsx` | No import in app. `app/dashboard/tools/salary/page.tsx` uses inline UI + `lib/salaryCalculations`. |
| 16 | `components/dashboard/LoanCalculatorModal.tsx` | No import in app or components. |
| 17 | `components/dashboard/ThirteenthMonthModal.tsx` | No import in app or components. |
| 18 | `components/dashboard/FinancialHealthModal.tsx` | No import in app. `app/dashboard/tools/financial-health/page.tsx` imports `FinancialSnapshotSection` directly. |
| 19 | `components/dashboard/CompactGoalListSection.tsx` | No file imports `CompactGoalListSection`. Only imports type `GoalWithSaved` from FocusGoalsSection. |
| 20 | `components/layout/Section.tsx` | No `from '...Section'` or `from '...layout/Section'` in codebase (only other *Section components, not layout/Section). |
| 21 | `components/ui/ProgressBar.tsx` | No import of `ProgressBar` in app or components. |
| 22 | `components/ui/KlaroPHEyeLogo.tsx` | No import; app uses `KlaroPHHandLogo` everywhere. |
| 23 | `components/goals/GoalForm.tsx` | No import in app or in GoalList/GoalsProgressSection. GoalList uses NewGoalModal flow. |
| 24 | `components/onboarding/FirstTimeFlow.tsx` | No import in app or any live component. |
| 25 | `components/ui/Button.tsx` | Only imported by `layout/Header.tsx` and `goals/GoalForm.tsx`, both in A. |
| 26 | `components/ui/Card.tsx` | Only imported by `goals/GoalForm.tsx`, which is in A. |

**Ordering note:** Delete A.1 (DashboardView) first, then the rest of the DashboardView tree (A.2–A.10). Then A.11–A.24 in any order. Delete A.25–A.26 (Button, Card) only after A.3 and A.23 are removed (they are the only consumers).

---

## B. High confidence legacy (blocked by one type/import uncertainty)

Likely dead, but one remaining type or import blocks deletion until refactor.

| # | File | Blocker | Trace evidence |
|---|------|---------|----------------|
| 1 | `components/dashboard/FocusGoalsSection.tsx` | **Type:** `GoalWithSaved` is imported by `app/dashboard/page.tsx` (lines 10, 35, 77). The **component** `<FocusGoalsSection>` is never rendered by any route. | `app/dashboard/page.tsx`: `import type { GoalWithSaved } from '@/components/dashboard/FocusGoalsSection'`; no JSX `<FocusGoalsSection`. |
| 2 | `components/dashboard/GoalQuickAdjustModal.tsx` | **Single consumer:** Only imported by `FocusGoalsSection.tsx`. Delete with or after FocusGoalsSection. | `FocusGoalsSection.tsx`: `import GoalQuickAdjustModal from './GoalQuickAdjustModal'` and usage in JSX. No other references. |

**Unblock steps for B:**  
1. Add `GoalWithSaved` to `types/database.ts` (or `types/goals.ts`): `export type GoalWithSaved = GoalRow & { saved: number }`.  
2. In `app/dashboard/page.tsx`, change to `import type { GoalWithSaved } from '@/types/database'` (or the chosen types file).  
3. Then delete `FocusGoalsSection.tsx` and `GoalQuickAdjustModal.tsx` (e.g. in same batch as A).

---

## C. Needs manual review

Routes, legal pages, API surfaces, or mixed active/stale files. Do not delete without product/owner confirmation.

| # | Item | Reason | Trace evidence |
|---|------|--------|----------------|
| 1 | **Route: `app/login/page.tsx`** | Redirect-only to `/#login`. Confirm whether `/login` is still a required entry (e.g. emails, marketing). | File: `window.location.href = '/#login'`; no other logic. |
| 2 | **API: `app/api/analytics/counts/route.ts`** | No call site in app, components, or lib. Possibly deprecated or planned for future use. | Grep for `analytics/counts` or `api/analytics/counts`: only `.next` and the route file itself. No `fetch('/api/analytics/counts')` in source. |
| 3 | **Legal pages: `app/privacy/page.tsx`, `app/terms/page.tsx`** | Active (linked from footer, legal-update). Review for stale copy, dates, or links. | Both import KlaroPHHandLogo; use `legal-page`, `legal-header`, etc. LAST_UPDATED in privacy. |
| 4 | **Legal flow: `app/legal-update/page.tsx` + `LegalUpdateForm.tsx` + `LegalUpdateReload.tsx`** | Active (consent gate). Confirm flow and that no dead code remains. | layout.tsx redirects when `needsLegalReconsent(profile)`; LegalUpdateForm calls `POST /api/legal/accept`. |
| 5 | **Doc: `LAYOUT_REPORT.md`** | Long layout/code report; may be stale (e.g. references old dashboard structure). | 829 lines; "Last updated" mentions dashboard top row, ExpensesTrendChartCard. Decide: keep as historical or trim. |
| 6 | **Route: `app/dashboard/learning/page.tsx`** | Active; inline content only. Confirm copy and that no links point to removed features. | No component imports; ARTICLES array + `page-header`; no dependency on deleted components. |
| 7 | **Route: `app/dashboard/tools/page.tsx`** | Redirect to `/dashboard`. Confirm product intent (keep as redirect vs remove route). | `router.replace('/dashboard')`; no other UI. |

---

## D. Active but messy (keep; simplify later)

Active code that should remain for launch but is a good candidate for later cleanup/simplification.

| # | Item | Why messy | Trace / notes |
|---|------|-----------|----------------|
| 1 | **`app/globals.css`** | ~4,911 lines; contains legacy blocks for removed components (financial-tools-section, tools-header, dashboard-top-bar, premium-dashboard-header). | Phase 0: active dashboard uses `dashboard-page`, `dashboard-top-cluster`, `dashboard-col-left`, `dashboard-col-budget`, etc. Remove only CSS for components in A/B after those components are deleted. |
| 2 | **`components/dashboard/BudgetOverview.tsx`** | Large (510 lines); mixes data fetch, overrides, and UI. | Used by dashboard page and expenses page; calls `/api/budget-effective`, `/api/expense-months`. Consider splitting hooks vs presentational later. |
| 3 | **`app/dashboard/expenses/page.tsx`** | Large page; many responsibilities (filters, charts, tables, modals). | Imports BudgetOverview, BudgetPlanner, FinancialChart, AddExpenseModal, EditExpenseModal, etc. Consider extracting sections or hooks post-launch. |
| 4 | **`app/dashboard/income/page.tsx`** | Same pattern as expenses: large, feature-rich. | Similar to expenses; IncomeAllocationModal, FinancialChart, range/grouping. |
| 5 | **`app/dashboard/profile/page.tsx`** | Profile form + multiple sections; possible to split by section later. | Uses ClarityBadge, ProfileActionCTA; fetches/patches `/api/profile`. |
| 6 | **`app/page.tsx` (landing)** | Landing + auth + modals in one file. | HowKlaroPHWorksModal, SignUpModal, KlaroPHHandLogo; long JSX. Consider extracting sections or components later. |

---

## Summary

| Bucket | Count | Action |
|--------|-------|--------|
| **A. Safe to delete now** | 26 files | Delete in controlled batches; remove Button/Card only after their only consumers (Header, GoalForm) are gone. |
| **B. High confidence legacy** | 2 files | Move `GoalWithSaved` to types, then delete with A or in immediate follow-up. |
| **C. Needs manual review** | 7 items | No deletion until product/owner confirms (login route, analytics/counts API, legal pages, LAYOUT_REPORT, learning, tools redirect). |
| **D. Active but messy** | 6 items | Keep; schedule simplification post-launch. |

**Critical systems (unchanged):** Auth, Supabase, PayMongo, Resend, onboarding, legal consent, subscriptions, goals, income, expenses, active dashboard cards, dashboard shell, sidebar, app router routes — all remain; only isolated or type-blocked legacy is in A/B.

---

*End of Phase 1 Cleanup Report. No deletions performed.*
