# Klaro Native

Offline-first Android app for KlaroPH. Local SQLite, the repository, and the push/pull sync engine stay the source of truth. Screens read and write through those APIs and do not change sync rules.

The Next.js app at the repo root does not import this package. `mobile/` is excluded from the root TypeScript project, ESLint, and Vitest so Vercel still builds only the web app.

## Screens

Light mode is the primary palette: blue `#0038A8`, yellow `#FCD116`, off-white cards with 26px corners. Dark mode follows the system appearance. Nunito is the rounded sans. Type, spacing, and motion tokens live in `src/ui/theme.ts`. Category icons are bundled in the app. Save, delete, and the + trigger haptic feedback on a device.

- First run is two screens. Then Home, History, and Goals. The three tabs are equal. A raised round yellow + sits centred above the bar and is not one of the tabs.
- Home shows this month's money left, one insight line from local rows, days logged, top category, and goal progress. With no budget and no entries it asks you to set a budget and offers starter goals instead of an em dash.
- Quick add opens from the +. A centred peso amount, category chips with icons sorted most-used first, repeat chips, and an Add note row that expands in the same sheet. Expense and income toggle. Tapping a repeat chip saves it, so a repeat is the + and that chip. The date starts as today in Asia/Manila and cannot move past today. On Free, it also stops 90 days back.
- Saving shows a toast, `Saved · ₱X left until payday`, in the same turn as the write. Undo soft-deletes through the existing delete path.
- History groups rows under day headers with the day's net total. The row title is the note, or the category when there is no note. Tap a row to edit. Swipe left, then Delete, to remove it. Free shows the last 90 days and the line "Entries older than 90 days are saved. Upgrade to Pro to see them." Older rows stay stored and cannot be edited or deleted on Free.
- Goals show progress as the sum of live allocations, or `saved_amount` when a goal has none. An empty list offers starter goals. Deposit writes an allocation. Limit and past-due grace copy comes from the sync engine.
- Settings sits behind the sun button: sync switch, email sign-in, and the uninstall warning. Sign-out clears local financial rows. The intro flag, last categories, and phone-only pay-period amounts are written back. If any rows have not synced, sign-out is blocked and the screen shows the count. The way through is the red "Delete unsynced entries" button, after a confirmation.

The budget ring uses the payday helper. When category budgets are already on the phone, it prorates that monthly total by the period's share of days in the month. Otherwise it uses one amount for the current pay period, stored only on the phone. Tap the ring to set it. That amount is not pushed.

## Run locally

Requirements: Node.js 22+, npm, and the Expo tooling (`npx expo`).

```bash
cd mobile
npm install
npm test
npx expo start
```

Phone-width web, including the local SQLite worker. The dev server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` so `SharedArrayBuffer` is available. Open the app at a 390×844 viewport.

```bash
cd mobile
npx expo start --web
```

`npm test` runs the sync, repository, payday, and screen tests. It does not need a device or a Supabase project. `npm run lint` runs `expo lint`. Use Node 22 (`.nvmrc` at the repo root and in this folder); Node 20 crashes `better-sqlite3` while the tests run.

`npm run perf:quick-add` seeds 1,000 expenses and prints the median and max of 10 quick adds. That run uses the in-memory test database. `node scripts/time-quick-add-web.mjs` times the same save through the Expo web UI, with the dev server already on port 8081.

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

`preview(userId)`, `adopt`, and `sync` read the signed-in user's own `subscriptions` row with their token (RLS `subscriptions_select_own`) and the `plans` rows (`plans_select_all`). They do not call `get_user_features`. That function stays revoked from `authenticated`. The goal cap matches `enforce_goal_plan_limit`: lifetime uses the `pro` plan's `max_goals` (then `clarity_premium`), an active unexpired `pro` or `clarity_premium` row uses that plan's `max_goals`, and every other row uses the free default of 2. Seeded values are free 2, pro 20, and clarity_premium 20. A null premium `max_goals` uses the trigger's `COALESCE` of 20. No subscription row uses Free. A failed read records the error, leaves the stored budget clock unchanged, and keeps the last plan this device resolved. Free is used only when no plan has been resolved yet. Other tables still sync. An explicit plan argument still overrides the cap. Local-only goal creation stays at 2.

Past-due grace, the state where the server raises `GOAL_CREATION_GRACE`, sets the new-goal cap to 0. The phone blocks those creates with `Your Pro payment is past due. Update it to add goals.` A blocked create stays on the device and leaves the push queue, so it is not retried on every sync. Deposits on that goal leave the queue with it and upload in the same sync, after the goal. They do not skip the refresh pull or other tables. After the subscription is current again, that create is uploaded once. A failed plan read during grace keeps this blocked state instead of releasing the goal. Goals the server already has still edit, delete, and sync as plain updates. `plans.has_budgeting` still allows budget edits during grace, and for lifetime and an active premium period.

Signed-in budget creates, replacements, and override saves follow the web routes (`POST /api/budget-plan`, `POST /api/budget-overrides`, and `PATCH`/`DELETE /api/budget-overrides/:id`). Full budgeting (Pro, including lifetime and grace) can always edit. A Free account can edit for 30 days after `auth.users.created_at`. `profiles.simulate_budget_expired` pretends the account is 31 days old. Past the window, the phone keeps the rows local, skips pushing `budget_plans` and `budget_overrides`, and reports `Upgrade to continue managing budgets beyond 30 days.` Other tables still sync, and pulled budget rows still apply. Local-only rows are not locked. The clock is stored only after a successful subscription read, so a failed read does not lock the budget.

`preview(userId)` returns live local counts (this user plus rows with no user) and live server counts. It does not upload. When unsynced device goals plus live account goals, minus pending deletes of synced goals, exceed the resolved plan cap, `goalLimitMessage` is `Free allows N goals; you have X here and Y in your account. Remove some to continue.` `adopt` assigns nothing in that case. `sync` still pulls and still pushes every other table; it does not insert the new goals. There is no goal picker. X counts device goals the server has not acknowledged yet, so goals already on the account are not counted twice. A combined total equal to the cap is allowed. There is no dedupe in v1.

`activateAccount` keeps local-only data on the first sign-in. Signing in as a different user wipes the previous account's rows and token. `signOut` always clears both.

## Not in this version

Pro checkout, reports, exports, category budget editing, and Google or magic-link sign-in. The phone can set one pay-period amount locally. It does not edit per-category budgets. Payday periods (`src/domain/payPeriod.ts`) use Asia/Manila and match the payday email window. Period A is the previous month's last day through the 14th. Period B is the 15th through the day before the month's last day. The last day of a month starts the next month's period A.
