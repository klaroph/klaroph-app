# Onboarding — Single Flow

**Status:** Single path. `FirstTimeFlow` was removed (dead code; never wired after layout gated onboarding via `/onboarding`).

## Live path: OnboardingFlow (route-based)

| | |
|---|--|
| **File** | `app/onboarding/OnboardingFlow.tsx` |
| **Used on** | `/onboarding` (`app/onboarding/page.tsx`) |
| **When it runs** | Dashboard layout (server) redirects to `/onboarding` when `profile.onboarding_completed === false`. |
| **Collects** | Income amount + frequency, goal (preset/name/target), savings %, confidence, financial stage / risk / motivation / dream, optional budget step. |
| **Saves** | `POST /api/onboarding/complete` → profile (`monthly_income`, `income_frequency`, `monthly_income_range` derived from amount, `savings_percent`, `savings_confidence`, identity fields, `onboarding_completed`) + creates first goal. |

## Removed: FirstTimeFlow

`components/onboarding/FirstTimeFlow.tsx` was an in-dashboard overlay that duplicated income/goal collection with a different field set. It is deleted. Optional welcome copy remains via `HowKlaroPHWorksModal` where still used.

## Rule for future changes

Do **not** reintroduce a second data-collecting onboarding overlay. Keep `/onboarding` as the only place that sets `onboarding_completed` and seeds income/goal profile fields.
