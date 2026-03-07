# Phase 0 — Dependency Trace Evidence (KlaroPH Prelaunch)

**Rule:** No deletion until the reference graph confirms isolation. This document is evidence only; no deletions are performed here.

---

## 1. Import dependency map (who imports whom)

### 1.1 Route entry points and their component tree

| Route | Entry file | Key component imports |
|-------|------------|------------------------|
| `/` | `app/page.tsx` | HowKlaroPHWorksModal, KlaroPHHandLogo, SignUpModal |
| `/login` | `app/login/page.tsx` | (minimal; redirect) |
| `/onboarding` | `app/onboarding/page.tsx` | OnboardingFlow → BudgetStep, KlaroPHHandLogo |
| `/legal-update` | `app/legal-update/page.tsx` | LegalUpdateForm, LegalUpdateReload, KlaroPHHandLogo |
| `/privacy`, `/terms` | `app/privacy/page.tsx`, `app/terms/page.tsx` | KlaroPHHandLogo |
| `/dashboard` | `app/dashboard/page.tsx` | GoalMomentumSection, ExpensesTrendChartCard, IncomeExpenseFlow, BudgetOverview, ManageGoalsModal, NewGoalModal, ActivationCelebration, CardHeaderWithAction, UpgradeCTA; **type** GoalWithSaved from FocusGoalsSection |
| `/dashboard` (layout) | `app/dashboard/layout.tsx` | DashboardLayoutClient → Sidebar, MobileQuickActions, HowKlaroPHWorksModal, UpgradeModal, GraceBanner, NewGoalModal, IncomeAllocationModal, AddExpenseModal |
| `/dashboard/expenses` | `app/dashboard/expenses/page.tsx` | AddExpenseModal, EditExpenseModal, BudgetOverview, BudgetPlanner, MonthOverrideModal, CardHeaderWithAction, FinancialChart, PremiumBadge, UpgradeCTA |
| `/dashboard/income` | `app/dashboard/income/page.tsx` | IncomeAllocationModal, CardHeaderWithAction, FinancialChart, PremiumBadge, UpgradeCTA |
| `/dashboard/goals` | `app/dashboard/goals/page.tsx` | GoalList, NewGoalModal, UpgradeCTA, PremiumBadge |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | ClarityBadge, ProfileActionCTA |
| `/dashboard/upgrade-success` | `app/dashboard/upgrade-success/page.tsx` | (hooks/context only) |
| `/dashboard/tools` | `app/dashboard/tools/page.tsx` | (redirect to /dashboard) |
| `/dashboard/tools/salary` | `app/dashboard/tools/salary/page.tsx` | (inline UI; lib/salaryCalculations) |
| `/dashboard/tools/loan` | `app/dashboard/tools/loan/page.tsx` | (inline UI) |
| `/dashboard/tools/thirteenth-month` | `app/dashboard/tools/thirteenth-month/page.tsx` | (inline UI) |
| `/dashboard/tools/financial-health` | `app/dashboard/tools/financial-health/page.tsx` | FinancialSnapshotSection |
| `/dashboard/learning` | `app/dashboard/learning/page.tsx` | Inline only (page-header, no external component imports) |

### 1.2 Reverse map: components never imported by any route or live tree

**Root dead:** `DashboardView.tsx` is **never imported** by any `app/` route or layout. Therefore the following are only reachable from `DashboardView` and are **isolated** (safe to delete only after batch plan):

| File | Imported by (only) |
|------|---------------------|
| `components/DashboardView.tsx` | (nobody) |
| `components/layout/DashboardLayout.tsx` | DashboardView only |
| `components/layout/Header.tsx` | DashboardView only |
| `components/goals/WelcomeSection.tsx` | DashboardView only |
| `components/dashboard/GoalsProgressSection.tsx` | DashboardView only |
| `components/dashboard/IncomeTrendSection.tsx` | DashboardView only |
| `components/dashboard/ExpensesOverviewSection.tsx` | DashboardView only |
| `components/dashboard/LearningSection.tsx` | DashboardView only |
| `components/dashboard/AdProvision.tsx` | DashboardView only |

**Header** imports: `Button`, `KlaroPHHandLogo`. So **Button** is only used by Header (dead tree) and by **GoalForm** (see below). **GoalForm** is never imported by any route or live component → **GoalForm** is isolated. **Card** is only imported by GoalForm → **Card** is isolated.

**ExpensesOverviewSection** imports **ManageExpensesModal**. So ManageExpensesModal is only in the dead tree → **ManageExpensesModal** is isolated.

**GoalsProgressSection** imports GoalList, NewGoalModal. Those are also used by live routes (dashboard/goals, DashboardLayoutClient), so GoalList and NewGoalModal stay; only GoalsProgressSection itself is dead.

**Other isolated components (no route or live parent imports):**

| File | Evidence |
|------|----------|
| `components/dashboard/PremiumDashboardHeader.tsx` | No import in app/ or in any live component |
| `components/dashboard/FinancialClarityToolsSection.tsx` | No import in app/ or in any live component |
| `components/dashboard/ToolsHeader.tsx` | No import in app/ or in any live component |
| `components/dashboard/DashboardTopBar.tsx` | No import in app/ or in any live component |
| `components/dashboard/SalaryCalculatorModal.tsx` | No import in app/; tools/salary page uses inline UI |
| `components/dashboard/LoanCalculatorModal.tsx` | No import in app/ |
| `components/dashboard/ThirteenthMonthModal.tsx` | No import in app/ |
| `components/dashboard/FinancialHealthModal.tsx` | No import in app/; financial-health page uses FinancialSnapshotSection directly |
| `components/dashboard/CompactGoalListSection.tsx` | No import in app/ or in any live component (only imports type from FocusGoalsSection) |
| `components/layout/Section.tsx` | No import of `Section` from layout or ui in codebase |
| `components/ui/ProgressBar.tsx` | No import in app/ or components |
| `components/ui/KlaroPHEyeLogo.tsx` | No import (KlaroPHHandLogo is used instead) |
| `components/goals/GoalForm.tsx` | No import in app/ or in GoalList/GoalsProgressSection (GoalList uses NewGoalModal flow) |
| `components/ui/Button.tsx` | Only Header (dead), GoalForm (dead) → isolated |
| `components/ui/Card.tsx` | Only GoalForm (dead) → isolated |
| `components/onboarding/FirstTimeFlow.tsx` | No import in app/ or in any live component |

**FocusGoalsSection:**  
- **Type:** `GoalWithSaved` is imported by `app/dashboard/page.tsx` (and by CompactGoalListSection, which is dead).  
- **Component:** `<FocusGoalsSection>` is **not** rendered by any route.  
So the file is a **type-only dependency**. Refactor: move `GoalWithSaved` to `types/` (e.g. `types/database.ts` or `types/goals.ts`), then the component and file can be removed in a later batch. **GoalQuickAdjustModal** is only used by FocusGoalsSection; once FocusGoalsSection is removed (after type move), GoalQuickAdjustModal is isolated.

---

## 2. Exported type dependencies

| Exported type | Defined in | Consumed by |
|---------------|------------|-------------|
| `GoalWithSaved` | `FocusGoalsSection.tsx` | `app/dashboard/page.tsx`, CompactGoalListSection (dead) |
| `IncomeRecordForEdit` | `IncomeAllocationModal.tsx` | `app/dashboard/income/page.tsx` |
| `ExpenseRecord` | `EditExpenseModal.tsx` | `app/dashboard/expenses/page.tsx`, ManageExpensesModal (dead) |
| `GoalForEdit` | `NewGoalModal.tsx` | `app/dashboard/goals/page.tsx` |
| `ProfileWithComputed` | `types/profile.ts` | profile page, API, Sidebar, contexts |
| `UserFeaturesWithSubscription` | `types/features.ts` | API, contexts, lib/features |
| `GoalRow` | `types/database.ts` | dashboard page, FocusGoalsSection, NewGoalModal |

**Action:** Before deleting `FocusGoalsSection.tsx`, add `GoalWithSaved` to a shared types file and update `app/dashboard/page.tsx` to import it from there.

---

## 3. Route references and entry points

- **App Router routes** (page.tsx): 18 routes listed in §1.1. No route imports `DashboardView` or any of the isolated components above.
- **Layout:** `app/dashboard/layout.tsx` → `DashboardLayoutClient` (Sidebar, modals, providers). No DashboardView or legacy dashboard shell.
- **Dynamic route segments:** `app/api/expenses/[id]`, `app/api/goals/[id]`, `app/api/income/[id]`, `app/api/budget-overrides/[id]` — API only.

---

## 4. Dynamic imports

- **Project source (app/, components/, lib/, hooks/, contexts/):** No `import()` or `lazy()` usage found. All imports are static.
- **.next and node_modules:** Contain dynamic imports (Next validator, vitest, etc.); out of scope for app cleanup.

---

## 5. CSS selector usage vs active classNames

**Source of truth for “active”:** classNames in `app/**/*.tsx` and in components that are in the **live** tree (reachable from routes above). Exclude components that are only reachable from `DashboardView` or other isolated roots.

**Active dashboard page** (`app/dashboard/page.tsx`) uses:

- `dashboard-page`, `dashboard-premium`, `page-header`, `free-plan-banner`
- `dashboard-top-cluster`, `dashboard-top-row`, `dashboard-col-left`, `dashboard-left-module`, `dashboard-col-budget`
- `card`, `dash-card`, `dash-card-no-border`, `card-outline-link`, `dashboard-card-link`

**Legacy CSS (in `app/globals.css`) used only by isolated components:**

- `.financial-tools-section` — only used by FinancialClarityToolsSection (isolated).
- `.tools-header-wrap`, `.tools-header-tagline`, `.tools-header`, `.tools-header-btn`, etc. — only used by ToolsHeader (isolated).
- `.dashboard-top-bar`, `.dashboard-top-bar-left`, `.dashboard-top-bar-title`, etc. — only used by DashboardTopBar (isolated).
- `.premium-dashboard-header` — only used by PremiumDashboardHeader (isolated).

**CSS that must be kept (used by active dashboard):**

- `.dashboard-two-col`, `.dashboard-three-col`, `.dashboard-col-left`, `.dashboard-col-budget`, `.dashboard-top-row`, `.dashboard-top-cluster`, `.dashboard-left-module`, and any responsive overrides that reference these.  
- `app/dashboard/page.tsx` uses `dashboard-col-left` and `dashboard-col-budget`; keep related grid/layout blocks.

**Safe to remove only after deleting the isolated components:**  
Blocks for `.financial-tools-section`, `.tools-header*`, `.dashboard-top-bar*`, `.premium-dashboard-header` (and their responsive variants). Do not remove `.dashboard-two-col`, `.dashboard-three-col`, `.dashboard-col-*` used by the current dashboard layout until verifying no other active page uses them.

---

## 6. Summary: isolation list (no deletion in this phase)

**Files safe to delete in a later controlled batch (after type refactor where noted):**

1. **DashboardView tree:**  
   `DashboardView.tsx`, `layout/DashboardLayout.tsx`, `layout/Header.tsx`, `goals/WelcomeSection.tsx`, `dashboard/GoalsProgressSection.tsx`, `dashboard/IncomeTrendSection.tsx`, `dashboard/ExpensesOverviewSection.tsx`, `dashboard/LearningSection.tsx`, `dashboard/AdProvision.tsx`, `dashboard/ManageExpensesModal.tsx`.

2. **Standalone isolated components:**  
   `PremiumDashboardHeader.tsx`, `FinancialClarityToolsSection.tsx`, `ToolsHeader.tsx`, `DashboardTopBar.tsx`, `SalaryCalculatorModal.tsx`, `LoanCalculatorModal.tsx`, `ThirteenthMonthModal.tsx`, `FinancialHealthModal.tsx`, `CompactGoalListSection.tsx`, `layout/Section.tsx`, `ui/ProgressBar.tsx`, `ui/KlaroPHEyeLogo.tsx`, `goals/GoalForm.tsx`, `onboarding/FirstTimeFlow.tsx`.

3. **UI used only by dead tree:**  
   `ui/Button.tsx`, `ui/Card.tsx` — only used by Header and GoalForm (both isolated). Confirm no other usage (e.g. global styles or other components) before deletion.

4. **After moving `GoalWithSaved` to types:**  
   `FocusGoalsSection.tsx`, `GoalQuickAdjustModal.tsx`.

**Refactor before delete:**  
- Move `GoalWithSaved` from `FocusGoalsSection.tsx` to `types/database.ts` (or `types/goals.ts`), then update `app/dashboard/page.tsx` to import from types. Then remove `FocusGoalsSection.tsx` and `GoalQuickAdjustModal.tsx` in a batch.

**CSS cleanup (after component deletion):**  
Remove from `globals.css` only the blocks for: `.financial-tools-section`, `.tools-header*`, `.dashboard-top-bar*`, `.premium-dashboard-header`. Keep `.dashboard-two-col`, `.dashboard-three-col`, `.dashboard-col-*`, `.dashboard-top-row`, `.dashboard-top-cluster`, `.dashboard-left-module` and related responsive rules used by the active dashboard.

**Critical systems (do not remove):**  
Authentication, Supabase (supabaseClient, supabaseServer, supabaseAdmin), PayMongo, Resend, onboarding, legal consent, subscriptions, goals, income, expenses, active dashboard cards (GoalMomentumSection, ExpensesTrendChartCard, IncomeExpenseFlow, BudgetOverview, etc.), dashboard shell (DashboardLayoutClient, layout), Sidebar, app router routes — all confirmed in the dependency graph above.

---

*End of Phase 0 dependency evidence. No deletions performed.*
