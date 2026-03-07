# KlaroPH — Complete Build Audit Report

**Scope:** Soft launch evaluation. All findings are based strictly on code present in the repository.  
**Date:** February 2025.

---

========================================
## 1. PROJECT STACK
========================================

| Item | Detail |
|------|--------|
| **Framework** | Next.js **16.1.6** (from `package.json`) |
| **Routing** | **App Router only.** All routes under `app/` (no `pages/` directory). |
| **Styling** | **Tailwind CSS v4** (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`). Global styles in `app/globals.css` (custom properties, BEM-like classes). No CSS Modules. |
| **Backend** | **Supabase** — `@supabase/supabase-js: ^2.97.0`, `@supabase/ssr: ^0.8.0`. No version pinned in migrations; use dashboard for runtime version. |
| **Auth methods** | **Email (password)** and **Google OAuth**. Implemented in `app/page.tsx` (landing) and `app/auth/callback/route.ts`. |
| **State management** | React `useState` / `useEffect` / `useCallback`. **SubscriptionContext** and **UpgradeTriggerContext** for subscription and upgrade modal. No Redux, Zustand, or other global store. |
| **Deployment readiness** | **Partial.** `instrumentation.ts` enforces required env in production. No `middleware.ts` in repo; dashboard protection is layout-based (server redirect). Build passes (`next build`). |

---

========================================
## 2. AUTHENTICATION FLOW
========================================

### Email signup flow (step-by-step)
1. User on landing (`/`) scrolls to `#login` or clicks "Get Started" / "Sign up".
2. User must check **"I agree to the Terms & Conditions and Privacy Policy"** (links to `/terms`, `/privacy` in new tab). Sign up button is **disabled** until `hasAcceptedTerms === true`.
3. User enters email and password; clicks **"Sign up"**.
4. `handleSignup` runs: if `!hasAcceptedTerms` → sets error "You must agree to the Terms and Privacy Policy to continue." and **does not call** `supabase.auth.signUp`. If accepted → `supabase.auth.signUp({ email, password })`.
5. On success: UI shows "Check your email to confirm your account." No redirect; user must confirm via email link (Supabase default).
6. After email confirmation, user signs in via same form with "Sign in" (no checkbox required for login).

### Google OAuth flow (step-by-step)
1. User clicks **"Sign in with Google"** (always enabled; not disabled by checkbox).
2. If **checkbox is checked:** `handleGoogleLogin` calls `triggerGoogleOAuth()` → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${NEXT_PUBLIC_APP_URL}/auth/callback` } })`.
3. If **checkbox is not checked:** `handleGoogleLogin` opens **consent modal** ("By continuing, you agree to our Terms & Conditions and Privacy Policy."). **Cancel** closes modal; **Continue** closes modal and calls `triggerGoogleOAuth()`.
4. User is redirected to Google; after auth, Supabase redirects to `NEXT_PUBLIC_APP_URL/auth/callback?code=...`.
5. `app/auth/callback/route.ts`: uses `createServerClient` (SSR), `exchangeCodeForSession(code)`, then `NextResponse.redirect(new URL('/dashboard', APP_URL))`. No profile-completion redirect in callback.
6. **Returning user:** Same flow. No checkbox required for **Sign in** (email/password). For Google, either checkbox already checked or user confirms in modal.

### Consent checkbox logic
- **Required for:** Email **Sign up** only (button disabled until checked; server-side guard in `handleSignup`).
- **Not required for:** Email **Sign in**.
- **Google:** Checkbox not required to click the button; if unchecked, a confirmation modal is shown; **Continue** triggers OAuth. No backend storage of consent.

### Returning user behavior
- If session exists (`supabase.auth.getSession()`), `useEffect` in landing page calls `router.replace('/dashboard')`.
- Dashboard layout (`app/dashboard/layout.tsx`) calls `createSupabaseServerClient().auth.getSession()`; if no session, `redirect('/')` (home/landing).

### Profile completion logic
- **New user:** Trigger `handle_new_user` (in DB) creates `profiles` row and free subscription. Profile has `onboarding_completed: false` (default).
- **Profile completion:** Stored in `profiles.onboarding_completed` and `profiles.profile_completion_percentage` (RPC `get_profile_completion_percentage`). Used by profile/onboarding UI (e.g. FirstTimeFlow). Not re-checked in auth callback; user lands on dashboard and onboarding may be shown by dashboard/context.

### Where profile data is stored
- **Table:** `public.profiles` (id = auth.users.id). Columns include: full_name, created_at, updated_at, nickname, avatar_url, monthly_income, monthly_income_range, income_frequency, savings_percent, primary_goal_category, financial_stage, savings_confidence, risk_comfort, motivation_type, dream_statement, profile_completion_percentage, clarity_level, streak_days, badges_json, onboarding_completed (from migrations).

### Known edge-case issues in auth
- **OAuth:** Callback assumes `NEXT_PUBLIC_APP_URL` is set; otherwise server throws at startup (instrumentation). If Site URL in Supabase Dashboard does not match `NEXT_PUBLIC_APP_URL`, OAuth redirect can fail.
- **Consent:** No timestamp or record of consent stored in DB; only in-session checkbox/modal. Cannot prove consent for a given signup after the fact.
- **Email confirmation:** User may close tab after signup and never confirm; no in-app reminder.

---

========================================
## 3. DATABASE STRUCTURE
========================================

**Source:** Supabase migrations under `supabase/migrations/` and API/component usage.  
**Note:** `income_records` and `expenses` base table creation is **not** present in the migrations reviewed; columns are inferred from API routes and seed script. `income_allocations` is referenced in code but has no migration in the audited set.

### Tables (with columns, types, RLS, relationships)

#### profiles
| Column | Type (inferred) |
|--------|------------------|
| id | uuid PK, FK → auth.users(id) ON DELETE CASCADE |
| full_name | text |
| created_at | timestamptz NOT NULL DEFAULT now() |
| updated_at | timestamptz |
| nickname | text |
| avatar_url | text |
| monthly_income | numeric |
| monthly_income_range | text |
| income_frequency | text |
| savings_percent | numeric |
| primary_goal_category | text |
| financial_stage | text (starter, stabilizing, building, scaling) |
| savings_confidence | int (1–5) |
| risk_comfort | text (low, medium, high) |
| motivation_type | text |
| dream_statement | text |
| profile_completion_percentage | int DEFAULT 0 |
| clarity_level | int NOT NULL DEFAULT 1 (1–5) |
| streak_days | int NOT NULL DEFAULT 0 |
| badges_json | jsonb NOT NULL DEFAULT '[]' |
| onboarding_completed | boolean NOT NULL DEFAULT false |

- **RLS:** Enabled. Policies: `profiles_select_own`, `profiles_update_own`, `profiles_insert_own` (own row by auth.uid() = id).
- **Triggers:** `profiles_updated_at` BEFORE UPDATE → sets updated_at.
- **Functions:** `get_profile_completion_percentage(uuid)`, `get_clarity_level(uuid)` (SECURITY DEFINER).

---

#### plans
| Column | Type |
|--------|------|
| id | uuid PK |
| name | text NOT NULL UNIQUE |
| max_goals | int NOT NULL |
| has_simulator | boolean NOT NULL DEFAULT false |
| has_scenarios | boolean NOT NULL DEFAULT false |
| has_smart_insights | boolean NOT NULL DEFAULT false |
| has_export | boolean NOT NULL DEFAULT false |
| has_analytics | boolean NOT NULL DEFAULT false |
| created_at | timestamptz NOT NULL DEFAULT now() |

- **Seed:** free (2 goals, all has_* false), pro (20 goals, all true), clarity_premium (same as pro).
- **RLS:** Enabled. Policy: `plans_select_all` FOR SELECT TO authenticated USING (true).

---

#### subscriptions
| Column | Type |
|--------|------|
| id | uuid PK |
| user_id | uuid NOT NULL FK → auth.users(id) ON DELETE CASCADE, UNIQUE |
| plan_id | uuid NOT NULL FK → plans(id) |
| status | text NOT NULL CHECK (status IN ('free','active','canceled','expired','trial','past_due','unpaid','incomplete')) |
| current_period_start | timestamptz NOT NULL DEFAULT now() |
| current_period_end | timestamptz NOT NULL |
| created_at | timestamptz NOT NULL DEFAULT now() |
| paymongo_subscription_id | text |
| paymongo_customer_id | text |
| paymongo_checkout_session_id | text |
| payment_provider | text DEFAULT 'manual' |
| plan_type | text NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free','monthly','annual')) |
| grace_period_until | timestamptz |
| grace_period_used | boolean NOT NULL DEFAULT false |
| auto_renew | boolean NOT NULL DEFAULT false |

- **RLS:** Enabled. Policies: `subscriptions_select_own` (auth.uid() = user_id), `subscriptions_service_update`, `subscriptions_service_insert` (service_role).
- **Indexes:** idx_subscriptions_paymongo_checkout, idx_subscriptions_paymongo_sub (partial, where not null).

---

#### goals
| Column | Type |
|--------|------|
| id | uuid PK |
| user_id | uuid NOT NULL FK → auth.users(id) ON DELETE CASCADE |
| name | text NOT NULL |
| target_amount | numeric NOT NULL CHECK (target_amount > 0) |
| saved_amount | numeric NOT NULL DEFAULT 0 CHECK (saved_amount >= 0) |
| created_at | timestamptz NOT NULL DEFAULT now() |
| pinned_at | timestamptz |

- **RLS:** Enabled. Policies: goals_select_own, goals_insert_own, goals_update_own, goals_delete_own (all by auth.uid() = user_id).

---

#### income_records
**Note:** CREATE TABLE not in audited migrations; structure inferred from API and seed.

| Column | Type (inferred) |
|--------|------------------|
| id | uuid (PK) |
| user_id | uuid |
| total_amount | numeric |
| disposable_amount | numeric |
| date | date (or text) |
| income_source | text (added in migration) |

- **RLS:** Enabled (migration 20250227100000). Policies: `income_records_select_90d_free` (free users see only date >= current_date - 90 days), `income_records_insert_own`, `income_records_update_own`, `income_records_delete_own`.

---

#### expenses
**Note:** CREATE TABLE not in audited migrations; structure inferred from API and seed.

| Column | Type (inferred) |
|--------|------------------|
| id | uuid (PK) |
| user_id | uuid |
| category | text |
| type | text (e.g. needs/wants) |
| amount | numeric |
| date | date (or text) |
| description | text (optional, added in migration) |

- **RLS:** Enabled. Same pattern as income_records: `expenses_select_90d_free`, `expenses_insert_own`, `expenses_update_own`, `expenses_delete_own`.

---

#### income_allocations
**Note:** No migration found in repo; referenced in `IncomeAllocationModal`, `GoalList`, `ManageGoalsModal`, `dashboard/page.tsx`, `clean_user_data.sql`.

| Column | Type (inferred) |
|--------|------------------|
| income_record_id | uuid (FK to income_records) |
| goal_id | uuid (FK to goals) |
| amount | numeric |

- **RLS:** Not audited (table creation not in migrations). Clean script truncates with CASCADE.

---

#### payment_events
| Column | Type |
|--------|------|
| id | uuid PK |
| event_id | text NOT NULL UNIQUE |
| event_type | text NOT NULL |
| payload | jsonb NOT NULL |
| processed_at | timestamptz NOT NULL DEFAULT now() |

- **RLS:** Enabled; service_role only (webhook idempotency).

---

#### support_requests
| Column | Type |
|--------|------|
| id | uuid PK |
| user_id | uuid FK → auth.users ON DELETE CASCADE |
| email | text |
| subject | text |
| message | text NOT NULL |
| status | text DEFAULT 'open' |
| created_at | timestamptz DEFAULT now() |

- **RLS:** Users insert/select own; service_role full access.

---

### Highlight: income_records
- Used by `/api/income` (POST/GET via list), `/api/income/[id]` (GET/PATCH/DELETE), analytics/counts, and RLS for 90-day free limit. Columns: user_id, total_amount, disposable_amount, date, income_source.

### Highlight: expense_records
- Table name in code is **expenses**. Used by `/api/expenses`, `/api/expenses/[id]`, analytics/counts, and RLS. Columns: user_id, category, type, amount, date, description.

### Highlight: profiles
- As above; Financial Identity Hub fields; onboarding_completed; clarity_level and streak_days; RLS own-row only.

### Highlight: subscriptions
- As above; PayMongo fields; plan_type (free/monthly/annual); grace_period_until; status includes free, active, past_due, etc. `get_user_features` (later migration) returns plan capabilities; app uses resolveUserPlan + resolveSubscriptionState for API/UI.

---

========================================
## 4. DASHBOARD FEATURES
========================================

### Widgets
- **Goal Momentum** (`GoalMomentumSection`): Total saved, total target, active goals count, donut chart (GoalMomentumDonut) for overall progress percentage.
- **Focus Goals** (`FocusGoalsSection`): Up to 3 focus goals (from goals list, sorted by pinned_at / progress / created_at); "Add goal", "Manage goals"; links to Goals Page.
- **Income & Expenses** (`IncomeExpenseFlow`): Recent income and expense entries; links to Income Page and Expenses Page.

### Metrics computed
- **totalSaved:** Sum of `goal.saved` (from income_allocations per goal + goals.saved_amount fallback) on dashboard.
- **totalTarget:** Sum of goals’ target_amount.
- **Progress percent:** totalTarget > 0 ? min(100, (totalSaved / totalTarget) * 100) : 0.
- **Profile:** profile_completion_percentage and clarity_level via RPCs get_profile_completion_percentage, get_clarity_level.
- **Analytics counts:** GET /api/analytics/counts returns income_records and expenses row counts (for upgrade triggers).

### How savings is calculated
- **Goal “saved”:** For each goal, sum of `income_allocations.amount` where goal_id = goal.id; if none, fallback to `goal.saved_amount`. Computed in dashboard load (goals + income_allocations select), not stored in a single column.

### Chart libraries
- **Chart.js** (`chart.js: ^4.5.1`) and **react-chartjs-2** (`^5.3.1`). Used in `FinancialChart` (Line, Bar, Pie, Doughnut, Radar). Config built in `utils/charts/buildChartConfig.ts` (and `lib/chart-types.ts` for plan-gated types).

### Goal tracking logic
- Goals stored in `goals`; allocations in `income_allocations`. Focus goals = first N after sort (pinned_at desc, progress desc, created_at desc). Max goals enforced by `features.max_goals` (from get_user_features / resolveUserPlan): free 2, pro 20. Create/update/delete via /api/goals and /api/goals/[id].

### Free vs Premium logic
- **API:** GET /api/features returns UserFeaturesWithSubscription (plan_name, max_goals, has_export, has_analytics, is_grace, can_create_goals, analyticsCutoffDate for 90-day free limit).
- **Frontend:** SubscriptionContext consumes /api/features; isPro, features, loading. Plan limits in `lib/planLimits.ts` (free: 2 goals, no export; pro: 20 goals, export, advanced analytics). Chart types gated by plan (e.g. line/bar vs area/multiLine, pie vs doughnut/radar) in `lib/chart-types.ts` and FinancialChart.

---

========================================
## 5. SUBSCRIPTION / PREMIUM SYSTEM
========================================

- **Premium implemented:** Yes. Pro / Clarity Premium plan with 20 goals, export, advanced analytics; PayMongo checkout and webhooks.
- **PayMongo integrated:** Yes. `lib/paymongo.ts`; `app/api/paymongo/create-checkout/route.ts` (POST: create checkout session, redirect to PayMongo); `app/api/paymongo/webhook/route.ts` (signature verification, idempotency via payment_events, handlers for checkout_session.payment.paid, subscription.activated, subscription.updated, etc.); `app/api/paymongo/subscription/route.ts` (GET status, DELETE cancel at period end). Env: PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET; optional CLARITY_PREMIUM_MONTHLY_CENTAVOS (default 14900 = ₱149).
- **Feature flags:** Plan capabilities come from DB (get_user_features / resolveUserPlan) and /api/features; no separate feature-flag service. Max goals, export, analytics, chart types driven by plan.
- **Subscription schema:** Table `subscriptions` (see §3); plans table with free/pro/clarity_premium; payment_events for webhook idempotency.

---

========================================
## 6. LANDING PAGE STATUS
========================================

- **Mock vs real data:** All landing content is **static/mock**. Hero headline, subheadline, CTA copy, feature list, how-it-works steps, Free vs Pro comparison, and final CTA are hardcoded in `app/page.tsx`. No API calls for landing content.
- **Dashboard preview:** **Hardcoded** static mock in `.landing-dashboard-mock`: "Monthly Overview – March", Income ₱52,340, Expenses ₱38,200, Net Savings ₱14,140, four bar divs, "Emergency Fund" 65% progress "₱65,000 / ₱100,000". Not connected to real data.
- **CTA behavior:** "Get Started" and "Create Free Account" link to `#login`. "See How It Works" and "Purpose" open HowKlaroPHWorksModal. "Sign In" links to `#login`. Sign up and Google require consent (checkbox or modal).
- **Mobile responsiveness:** CSS in globals.css: landing sections use media queries (e.g. 900px: single column hero, stacked features; 600px: smaller type, full-width buttons, stacked cards). Landing nav, features grid, compare grid, final CTA, and consent modal have responsive rules.

---

========================================
## 7. LEGAL IMPLEMENTATION
========================================

- **Privacy page:** **Exists.** `app/privacy/page.tsx` — static content (Introduction, Information We Collect, How We Use, Data Storage & Security [Supabase], Third-Party [Google OAuth], User Rights, Contact support@klaroph.com). Last updated: February 2025. Link in footer and in signup checkbox.
- **Terms page:** **Exists.** `app/terms/page.tsx` — static content (Acceptance, Use of Service, User Responsibilities, Data Accuracy Disclaimer, Limitation of Liability, Subscription & Billing, Termination, Changes to Terms). Last updated: February 2025. Link in footer and in signup checkbox.
- **Consent timestamp stored:** **NOT IMPLEMENTED.** Consent is UI-only (checkbox state and modal "Continue"); no column or table stores when the user agreed to terms/privacy.
- **Version tracking:** **NOT IMPLEMENTED.** Legal pages show a single "Last updated: February 2025" constant; no version history or per-user accepted version.
- **Account deletion:** **NOT IMPLEMENTED.** No route or UI to delete account or request data deletion. Terms mention "You may close your account" and "we may retain or delete your data as described in our Privacy Policy" but there is no in-app flow. Individual entities (goals, income, expenses) can be deleted via API; no full account + profile + data purge.

---

========================================
## 8. KNOWN ISSUES
========================================

### TODO / FIXME
- **Project source (app, lib, components):** No TODO or FIXME comments found. (Only .next and node_modules contain TODOs.)

### Console
- **auth/callback:** `console.log` in development for callback URL and session user id. `console.error` on OAuth error.
- **create-checkout:** `console.log` for success_url and Create session. Not stripped in production.
- **Webhook:** `console.error` / `console.warn` for missing or invalid webhook config/signature/timestamp.
- **API routes:** Various `console.error` on catch (e.g. POST/GET income, expenses, features). No evidence of console.log of sensitive data.

### Unused variables
- Not fully scanned; no obvious critical unused exports. SubscriptionContext and UpgradeTriggerContext are used.

### Broken imports
- Build passes; no broken imports reported.

### Missing env variables
- **Required (instrumentation.ts):** NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (all envs); in production also SUPABASE_SERVICE_ROLE_KEY, PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET.
- **Optional / doc:** DATABASE_URL (db scripts), NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY (.env.example), CLARITY_PREMIUM_MONTHLY_CENTAVOS (defaults to 14900 in create-checkout).

### Hardcoded secrets
- **None found.** Supabase and PayMongo keys read from process.env. No API keys or passwords in source.

---

========================================
## 9. SECURITY REVIEW
========================================

- **Supabase keys:** Anon key and URL are public (NEXT_PUBLIC_*); used in browser client. Service role key used only in server (supabaseAdmin, webhook, profile upsert). No service role key in client code.
- **RLS:** Enabled on profiles, plans, subscriptions, goals, income_records, expenses, payment_events, support_requests. Policies restrict by auth.uid() or service_role. get_user_features and is_free_analytics_user are SECURITY DEFINER with search_path = public.
- **Admin routes:** No dedicated "/admin" route found. Dashboard is protected by layout (session check); API routes use createSupabaseServerClient().auth.getUser() for auth. Webhook uses service role and signature verification.
- **API validation:** Income/expenses/goals routes validate body (e.g. total_amount, amount, category) and return 400 on invalid input. Auth: 401 when no user. No rate limiting or request signing in code.

---

========================================
## 10. PRODUCTION READINESS SCORE
========================================

| Category | Score (0–100) | Reasoning |
|----------|----------------|-----------|
| **Stability** | 75 | Build passes; auth and subscription flows are implemented; RLS and triggers present. Risk: income_records/expenses/income_allocations base schema not in repo; handle_new_user has been altered multiple times (latest uses ON CONFLICT). |
| **Security** | 72 | RLS on all user data; keys in env; webhook signature and idempotency. No consent or account-deletion audit trail; no rate limiting on API. |
| **UX polish** | 78 | Landing, dashboard, modals, and legal pages are structured and responsive. Chart.js and goal momentum in place. Some console logs in prod paths; no major UX bugs reported in code. |
| **Monetization readiness** | 82 | PayMongo checkout and webhooks; subscription state and feature gating; upgrade success page. Grace period and cancel-at-period-end implemented. |
| **Legal readiness** | 58 | Privacy and Terms pages exist and are linked; consent required for signup and for Google (via modal). No stored consent timestamp, no version tracking, no account deletion flow — weak for strict GDPR/DPA-style evidence. |

**Overall (soft launch):** The app is suitable for a soft launch with clear documentation of limitations: consent not stored, no account deletion, and reliance on Supabase/Dashboard for user data lifecycle. Recommend adding consent timestamp and account deletion for a fuller launch.

---

*End of report. All content derived from repository code only.*
