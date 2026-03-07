# KlaroPH Prelaunch — Final Cleanup Report

**Principle:** Launch stability over aggressive deletion. Safe cleanup only.

---

## Phase 6 — Verification Summary

| Check | Result |
|-------|--------|
| **Lingering imports** | No imports reference deleted files. Grep for removed component names (DashboardView, FocusGoalsSection, etc.) in `app/` and live components shows no broken imports. |
| **Lint** | `npm run lint` reports **pre-existing** issues (42 problems: no-explicit-any, set-state-in-effect, no-html-link-for-pages, unescaped entities, etc.). None were introduced by Phases 2–5. |
| **Type check** | `npx tsc --noEmit` — **pass** (exit 0). |
| **Build** | `npm run build` — **pass** (exit 0). All 28 routes compile. |
| **Routes verified** | Dashboard (`/dashboard`), Goals (`/dashboard/goals`), Income (`/dashboard/income`), Expenses (`/dashboard/expenses`), Auth (`/auth/callback`, `/login`), Onboarding (`/onboarding`), Subscriptions (PayMongo routes + `/dashboard/upgrade-success`) — all present and built. |

**Conclusion:** Cleanup did not break build or typecheck. Lint issues are out of scope for this cleanup; address separately if desired.

---

## 1. Deleted Files / Selectors

### 1.1 Components (Phase 2 — low-risk deletion)

| File | Notes |
|------|--------|
| `components/DashboardView.tsx` | Never imported by any route; root of dead tree. |
| `components/layout/DashboardLayout.tsx` | Only used by deleted DashboardView. |
| `components/layout/Header.tsx` | Only used by deleted DashboardView. |
| `components/dashboard/PremiumDashboardHeader.tsx` | No route or live component import. |
| `components/dashboard/DashboardTopBar.tsx` | No route or live component import. |
| `components/dashboard/FinancialClarityToolsSection.tsx` | No route or live component import. |

### 1.2 Components (Phase 3 — refactor-first removal)

| File | Notes |
|------|--------|
| `components/dashboard/FocusGoalsSection.tsx` | Type `GoalWithSaved` moved to `types/database.ts`; then file removed. |
| `components/dashboard/GoalQuickAdjustModal.tsx` | Only consumer was FocusGoalsSection; removed with it. |
| `components/dashboard/CompactGoalListSection.tsx` | Unused; only imported type from FocusGoalsSection; removed after type move. |

### 1.3 CSS selectors (Phase 4 — globals.css)

Removed only where **zero** active `className` references were confirmed:

| Removed | Notes |
|---------|--------|
| `.financial-tools-section` | No TSX reference. |
| `.dashboard-top-bar`, `.dashboard-top-bar-left`, `.dashboard-top-bar-title`, `.dashboard-top-bar-desc`, `.dashboard-top-bar-tools`, `.dashboard-top-bar-tagline`, `.dashboard-top-bar-btns` | No TSX reference (DashboardTopBar deleted). |
| `.premium-dashboard-header` + full `@media (max-width: 768px)` block for `.premium-header-*`, `.header-angled-bg`, `.mobile-header-row-*` | No TSX reference (PremiumDashboardHeader deleted). |
| `.dashboard-two-col`, `.dashboard-three-col` | No TSX reference; active layout uses `.dashboard-top-cluster` / `.dashboard-top-row` / `.dashboard-col-left` / `.dashboard-col-budget`. |
| `.dashboard-col-focus`, `.dashboard-col-tools`, `.dashboard-col-momentum` | No TSX reference. |
| Legacy mobile overrides for the above in `@media (max-width: 768px)` and `@media (max-width: 1024px)` | Refactored to keep only rules for active selectors (e.g. `.dashboard-top-row`). |
| `.focus-goals-card` from shared selector | Removed from selector; kept `.goal-momentum-executive`, `.card.dash-card`. |

**Not removed:** `.tools-header*`, `.tool-link-btn*` (still used by `ToolsHeader.tsx`).

---

## 2. Refactor-First Removals Completed

| Step | Detail |
|------|--------|
| Type migration | `GoalWithSaved` moved from `FocusGoalsSection.tsx` to `types/database.ts`. |
| Import updates | `app/dashboard/page.tsx` now imports `GoalWithSaved` from `@/types/database`. |
| Component deletion | After type move: `FocusGoalsSection.tsx`, `GoalQuickAdjustModal.tsx`, `CompactGoalListSection.tsx` removed. |

No other retired components exported types used by live code; no further refactor-first deletions were required.

---

## 3. Remaining Manual Review Items

Do **not** delete or change without product/owner confirmation:

| Item | Reason |
|------|--------|
| **`app/login/page.tsx`** | Redirect-only to `/#login`. Confirm if `/login` is still required (e.g. emails, deep links). |
| **`app/api/analytics/counts/route.ts`** | No call site in app/components/lib. Confirm if deprecated or reserved for future use. |
| **Legal pages** (`app/privacy/page.tsx`, `app/terms/page.tsx`) | Active; review for stale copy, dates, and links. |
| **Legal flow** (`app/legal-update/` + LegalUpdateForm, LegalUpdateReload) | Active consent gate; confirm flow and any dead code. |
| **`LAYOUT_REPORT.md`** | Long doc; may be stale. Decide: keep as historical or trim. |
| **`app/dashboard/learning/page.tsx`** | Active; confirm copy and links. |
| **`app/dashboard/tools/page.tsx`** | Redirect to `/dashboard`. Confirm product intent. |

---

## 4. Deferred Post-Launch Items

Safe to do **after** launch:

| Category | Items |
|----------|--------|
| **Orphaned components (Phase 1 “Safe to delete”)** | Remaining files from the original list that were **not** deleted in Phases 2–3: e.g. `WelcomeSection`, `GoalsProgressSection`, `IncomeTrendSection`, `ExpensesOverviewSection`, `LearningSection`, `AdProvision`, `ManageExpensesModal`, `ToolsHeader`, `SalaryCalculatorModal`, `LoanCalculatorModal`, `ThirteenthMonthModal`, `FinancialHealthModal`, `Section.tsx`, `ProgressBar.tsx`, `KlaroPHEyeLogo`, `GoalForm`, `FirstTimeFlow`, `Button.tsx`, `Card.tsx`. Delete only after a fresh reference check (they are not imported by any current route). |
| **Lint** | Address pre-existing ESLint/React rules (no-explicit-any, set-state-in-effect, no-html-link-for-pages, unescaped entities, etc.) in a dedicated pass. |
| **Further CSS** | If/when remaining legacy components above are removed, remove their CSS from `globals.css` in a follow-up batch. |

---

## 5. Active but Messy Areas Intentionally Preserved

Kept for launch; simplify later if desired:

| Area | Why preserved |
|------|----------------|
| **`app/globals.css`** | Still large (~4,624 lines after Phase 4). Only selectors tied to **deleted** components were removed. Rest is active or shared. |
| **`components/dashboard/BudgetOverview.tsx`** | Large; mixes fetch and UI. Active on dashboard and expenses. |
| **`app/dashboard/expenses/page.tsx`** | Large page; many concerns. Active. |
| **`app/dashboard/income/page.tsx`** | Same pattern as expenses. Active. |
| **`app/dashboard/profile/page.tsx`** | Multi-section profile. Active. |
| **`app/page.tsx` (landing)** | Long; landing + auth + modals. Active. |

No structural changes were made to these; only safe deletions and refactors were applied elsewhere.

---

## Critical Systems — Unchanged

The following were **not** modified (beyond the targeted trims in Phase 5):

- **Authentication** — Supabase auth, callback, login redirect.
- **Supabase** — supabaseClient, supabaseServer, supabaseAdmin.
- **PayMongo** — create-checkout, subscription, webhook.
- **Resend** — (if used; not touched).
- **Onboarding** — OnboardingFlow, BudgetStep, `/api/onboarding/complete`.
- **Legal consent** — legal-update flow, `/api/legal/accept`, profile consent.
- **Subscriptions** — SubscriptionContext, features API, upgrade-success, GraceBanner.
- **Goals** — GoalList, NewGoalModal, ManageGoalsModal, goals API.
- **Income** — IncomeAllocationModal, income API, dashboard/income page.
- **Expenses** — AddExpenseModal, EditExpenseModal, BudgetOverview, BudgetPlanner, expenses API.
- **Active dashboard** — GoalMomentumSection, ExpensesTrendChartCard, IncomeExpenseFlow, BudgetOverview, CardHeaderWithAction, UpgradeCTA, ActivationCelebration.
- **Dashboard shell** — DashboardLayoutClient, layout, Sidebar, MobileQuickActions.
- **App router routes** — All 28 routes built successfully.

---

*End of Final Cleanup Report. Launch stability prioritized; safe cleanup only.*
