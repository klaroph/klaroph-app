# Why There Are Two Onboarding Flows

## 1. **OnboardingFlow** (route-based)

| | |
|---|--|
| **File** | `app/onboarding/OnboardingFlow.tsx` |
| **Used on** | **`/onboarding`** page (`app/onboarding/page.tsx`) |
| **When it runs** | Dashboard **layout (server)** redirects to `/onboarding` when `profile.onboarding_completed === false`. |
| **Steps** | 4: (1) Income range + frequency, (2) Primary goal category, (3) Savings confidence 1–5, (4) Create first goal (name + target). |
| **Saves** | `POST /api/onboarding/complete` → updates profile (monthly_income_range, income_frequency, primary_goal_category, savings_confidence, onboarding_completed) + creates one goal. |

## 2. **FirstTimeFlow** (in-dashboard)

| | |
|---|--|
| **File** | `components/onboarding/FirstTimeFlow.tsx` |
| **Used in** | **DashboardLayoutClient** (inside dashboard layout). |
| **When it runs** | Client fetches `/api/profile` and either: **(a)** `onboarding_completed !== true` → show FirstTimeFlow, or **(b)** `onboarding_completed === true` but `!hasSeenFirstTimeOnboarding()` (localStorage) → show FirstTimeFlow. |
| **Steps** | Intro screen, then income + frequency, goal (preset/name/target), savings %, then “Go to dashboard”. |
| **Saves** | `POST /api/goals` for the goal + `supabase.from('profiles').update({ monthly_income, income_frequency, savings_percent, onboarding_completed })` + sets localStorage so it won’t show again. |

## Why this is confusing

- **Same purpose**: Both collect income + goal (and related) data and set `onboarding_completed: true`.
- **Different entry points**: One is a **redirect to a page** (`/onboarding`), the other is an **overlay inside the dashboard**.
- **Different APIs/fields**: OnboardingFlow uses `/api/onboarding/complete` and profile fields like `monthly_income_range`, `primary_goal_category`, `savings_confidence`. FirstTimeFlow uses `monthly_income`, `savings_percent` and creates the goal via `/api/goals`.
- **Overlap**: If the server redirect works, users with incomplete onboarding go to `/onboarding` and only see **OnboardingFlow**. But if they ever hit the dashboard client with `onboarding_completed === false` (e.g. race after OAuth), they see **FirstTimeFlow** instead. So the same user could conceptually hit either flow depending on timing. Plus, users who already completed onboarding (via OnboardingFlow) can still see FirstTimeFlow once because of the localStorage “first time” check.

## Recommendation

**Use a single onboarding flow:**

1. **Keep** the **`/onboarding`** route and **OnboardingFlow** as the only place that collects onboarding data and sets `onboarding_completed`.
2. **Change the dashboard layout client** so it never shows FirstTimeFlow when `onboarding_completed === false`. Instead, rely on the server redirect to `/onboarding` (already in place). So remove the “if !completed then setShowFirstTime(true)” branch; only use the “hasSeenFirstTimeOnboarding” localStorage check if you still want a **non–data-collecting** welcome (e.g. “How KlaroPH works”).
3. **Either remove FirstTimeFlow** (and use only OnboardingFlow + optional HowKlaroPHWorksModal), **or** turn FirstTimeFlow into a **short welcome/explainer** that does **not** collect income/goal again and does **not** set `onboarding_completed` (so it’s just a one-time modal after first login, gated by localStorage).

That way there is only one “version” of the real onboarding flow (OnboardingFlow on `/onboarding`), and no duplicate data collection or two ways to set `onboarding_completed`.
