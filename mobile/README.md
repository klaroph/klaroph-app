# Klaro Native

Offline-first Android app for KlaroPH. This folder is the non-visual foundation: a local SQLite database, a repository, and a push/pull sync engine. The screen is only a placeholder.

The Next.js app at the repo root does not import this package. `mobile/` is excluded from the root TypeScript project, ESLint, and Vitest so Vercel still builds only the web app.

## Run locally

Requirements: Node.js 22+, npm, and the Expo tooling (`npx expo`).

```bash
cd mobile
npm install
npm test
npx expo start
```

`npm test` runs the sync, repository, and payday tests. It does not need a device or a Supabase project.

To open the placeholder on an Android emulator or a device with Expo Go:

```bash
npm run android
```

## Sync credentials

Copy the example env file and fill in the **publishable** Supabase key. Do not put the service role key in the app, and do not copy secrets out of the web app's `.env.local`.

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

Wire-up lives in `src/sync/supabaseRemote.ts` (`createKlaroSupabase`) and `src/sync/secureTokenStore.ts`. Sign-out clears that token store and every local row.

## How the local database works

Drizzle schema: `src/db/schema.ts`. SQL migrations: `drizzle/`. The app applies them on launch with `useMigrations`.

Synced tables mirror the server columns added for offline sync:

- `expenses`
- `income_records`
- `goals`
- `income_allocations`
- `budget_plans`
- `budget_overrides`
- `financial_accounts`

`dirty` and `base_updated_at` exist only on the device. The client generates row ids. The server trigger owns `updated_at` and a tombstone's `deleted_at`, so those are not chosen by the app.

`saved_amount` is stored when a goal is pulled. Repository writes never set it. Goal progress is the sum of live allocations when any exist (a sum of zero still wins), otherwise `saved_amount`.

A deposit is an `income_allocations` row with `user_id` and an optional `income_record_id`. Soft-deleting a goal or an income record tombstones its live allocations locally. The server does the same with `cascade_soft_delete_allocations`.

Local-only mode (no `user_id`) enforces the free goal cap of **2**, the default in `enforce_goal_plan_limit` and the seeded `plans` row named `free`. Passing a higher `maxGoals` does not raise that local-only cap. Production enforces the account cap with trigger `goals_enforce_plan_limit` only. The device does not apply the 300-row tool limit.

## Sync

`SyncEngine` in `src/sync/engine.ts`:

1. Pulls `user_id = ?` and `updated_at` at or after the cursor minus a 5 minute overlap. Pages break ties with `(updated_at, id)`. A repeated page is safe because each row is stored by id.
2. Pushes pending goal deletes, then checks the goal cap. A new goal that still does not fit is left on the device and reported. Expenses, income, and every other table still sync. Acknowledged rows are updated by id. Only rows the server has never acknowledged are inserted, because an upsert runs the goal-limit trigger on its insert half.
3. Pulls again so server stamps land locally.

Pull pages request at most 1000 rows, which is the server max. A full page is followed by another page.

When a live local budget that has never been acknowledged uses the same category (and month) as a different account row, the account row wins and the merge summary includes `1 budget kept from your account` (or `N budgets`). Replacing a budget on the web, which tombstones the synced row and inserts a new id, is not counted.

Delete wins over an edit. A push includes `deleted_at` only when the local row is already a tombstone, and it never sends `deleted_at: null` or `saved_amount`. A row created and deleted before it was ever acknowledged is dropped locally instead of inserted as a server tombstone.

`preview(userId)`, `adopt`, and `sync` read the signed-in user's own `subscriptions` row with their token (RLS `subscriptions_select_own`) and the `plans` rows (`plans_select_all`). They do not call `get_user_features`. That function stays revoked from `authenticated`. The goal cap matches `enforce_goal_plan_limit`: lifetime uses the `pro` plan's `max_goals` (then `clarity_premium`), an active unexpired `pro` or `clarity_premium` row uses that plan's `max_goals`, and every other row uses the free default of 2. Seeded values are free 2, pro 20, and clarity_premium 20. A null premium `max_goals` uses the trigger's `COALESCE` of 20. No subscription row, or a failed read, uses Free. A failed read records the error, leaves the stored budget clock unchanged, and still syncs other tables. An explicit plan argument still overrides the cap. Local-only goal creation stays at 2.

Past-due grace, the state where the server raises `GOAL_CREATION_GRACE`, sets the new-goal cap to 0. The phone blocks those creates with `Your Pro payment is past due. Update it to add goals.` A blocked create stays on the device and leaves the push queue, so it is not retried on every sync. After the subscription is current again, that create is uploaded once. Goals the server already has still edit, delete, and sync as plain updates. `plans.has_budgeting` still allows budget edits during grace, and for lifetime and an active premium period.

Signed-in budget creates, replacements, and override saves follow the web routes (`POST /api/budget-plan`, `POST /api/budget-overrides`, and `PATCH`/`DELETE /api/budget-overrides/:id`). Full budgeting (Pro, including lifetime and grace) can always edit. A Free account can edit for 30 days after `auth.users.created_at`. `profiles.simulate_budget_expired` pretends the account is 31 days old. Past the window, the phone keeps the rows local, skips pushing `budget_plans` and `budget_overrides`, and reports `Upgrade to continue managing budgets beyond 30 days.` Other tables still sync, and pulled budget rows still apply. Local-only rows are not locked. The clock is stored only after a successful subscription read, so a failed read does not lock the budget.

`preview(userId)` returns live local counts (this user plus rows with no user) and live server counts. It does not upload. When unsynced device goals plus live account goals, minus pending deletes of synced goals, exceed the resolved plan cap, `goalLimitMessage` is `Free allows N goals; you have X here and Y in your account. Remove some to continue.` `adopt` assigns nothing in that case. `sync` still pulls and still pushes every other table; it does not insert the new goals. There is no goal picker. X counts device goals the server has not acknowledged yet, so goals already on the account are not counted twice. A combined total equal to the cap is allowed. There is no dedupe in v1.

`activateAccount` keeps local-only data on the first sign-in. Signing in as a different user wipes the previous account's rows and token. `signOut` always clears both.

## Not in this foundation

Pro checkout, reports, exports, and any designed screens. Payday periods (`src/domain/payPeriod.ts`) use Asia/Manila and match the payday email window. Period A is the previous month's last day through the 14th. Period B is the 15th through the day before the month's last day. The last day of a month starts the next month's period A.
