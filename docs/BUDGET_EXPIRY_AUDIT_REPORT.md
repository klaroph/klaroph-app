# KlaroPH 30-Day Budgeting Expiry Audit Report

**Goal:** After budgeting trial expires, users retain visibility of existing budget data while management actions are intelligently locked (lock icon, clickable → upgrade modal). Trust-preserving; no data hidden.

---

## 1. Where expiry logic currently applies

| Layer | Location | Behavior |
|-------|----------|----------|
| **Entitlement** | `lib/entitlements.ts` | `getBudgetEditingAllowed(plan, userCreatedAt)` — Pro always true; Free true only when `daysSinceCreation <= BUDGET_FREE_TRIAL_DAYS` (30). Uses auth user `created_at`. |
| **Features API** | `app/api/features/route.ts` | Calls `getBudgetEditingAllowed`; returns `has_budget_editing` in features. Frontend uses this for `canEditBudget`. |
| **Budget plan API** | `app/api/budget-plan/route.ts` | **GET:** no entitlement check (view allowed). **POST:** checks `resolvePlanAndBudgetEntitlement`; if not allowed returns 403 with `locked: true`, `reason: 'budget'`. |
| **Budget overrides API** | `app/api/budget-overrides/route.ts` | **GET:** no entitlement check (view allowed). **POST:** same 403 lock as budget-plan. |
| **Budget overrides [id]** | `app/api/budget-overrides/[id]/route.ts` | **PATCH** and **DELETE:** same entitlement check; 403 when not allowed. |
| **Budget effective API** | `app/api/budget-effective/route.ts` | **GET only** — no entitlement check; returns effective budget for viewing. |
| **Frontend** | `BudgetOverview`, `BudgetPlanner`, `MonthOverrideModal` | Use `features?.has_budget_editing` (from `/api/features`) to show edit vs lock state; on 403 from save, open upgrade modal. |

**Summary:** Expiry is enforced server-side on all write operations (budget plan save, override create/update/delete). Read operations (GET budget-plan, budget-overrides, budget-effective) are **not** gated, so existing data remains visible after expiry.

---

## 2. Weak points (pre-refinement)

| Weak point | Impact |
|------------|--------|
| Locked actions looked like generic “Upgrade to edit budget” instead of the same action labels with lock. | Users didn’t see “Edit This Month” / “Edit Spending Plan” as available-but-locked. |
| No lock icon on budget lock buttons. | Lock state was not visually clear. |
| Upgrade modal message was generic or API error text. | No consistent “Upgrade to continue managing budgets beyond 30 days” when hitting budget lock. |
| Message string duplicated across API routes. | Harder to keep wording consistent. |

---

## 3. Files affected (refinements applied)

| File | Change |
|------|--------|
| `lib/budgetLockMessage.ts` | **New.** Single constant `BUDGET_LOCK_UPGRADE_MESSAGE`: "Upgrade to continue managing budgets beyond 30 days." |
| `app/api/budget-plan/route.ts` | Use `BUDGET_LOCK_UPGRADE_MESSAGE` from `lib/budgetLockMessage` for 403 error text. |
| `app/api/budget-overrides/route.ts` | Same. |
| `app/api/budget-overrides/[id]/route.ts` | Same for PATCH and DELETE 403. |
| `components/dashboard/BudgetOverview.tsx` | Import `LockIcon` and `BUDGET_LOCK_UPGRADE_MESSAGE`. When `!canEditBudget`: show "Set Budget" / "Edit This Month" / "Edit Spending Plan" with lock icon; buttons remain clickable and call `openUpgrade({ message: BUDGET_LOCK_UPGRADE_MESSAGE })`. No disabled dead buttons. |
| `components/budget/BudgetPlanner.tsx` | On 403 locked response, call `openUpgrade({ message: BUDGET_LOCK_UPGRADE_MESSAGE })` and set error to API message or constant. |
| `components/budget/MonthOverrideModal.tsx` | Same as BudgetPlanner for 403 locked. |

---

## 4. Post-expiry behavior (after refinements)

**Allowed (unchanged):**

- View existing budgets (GET budget-plan, budget-overrides, budget-effective).
- View budget progress, health donut, category breakdown.
- View historical values and month picker (e.g. 90-day and other views where data exists).
- Filters and date ranges that don’t require budget write.

**Locked (refined UX):**

- Create new budgets / Set Budget → button with lock icon, clickable → upgrade modal with `BUDGET_LOCK_UPGRADE_MESSAGE`.
- Edit budgets (Edit Spending Plan, Edit This Month) → same: lock icon, clickable → upgrade modal.
- Delete budgets / add new budget categories → blocked by API 403; if user reaches save from a flow, modal opens with same message.

**Trust:**

- No code path hides or removes existing budget data after expiry. GET endpoints do not check entitlement.

---

## 5. Cross-page and mobile

- **Dashboard:** `BudgetOverview` with `showBudgetEditorButtons={false}` — no edit buttons on dashboard; user goes to Expenses for budget management. No change required for lock behavior.
- **Expenses page:** Full `BudgetOverview` with `onSetBudget` and `onEditThisMonth`. Lock state shows “Edit This Month” and “Edit Spending Plan” with lock icon; both open upgrade modal. Same on mobile and desktop.
- **FAB flows:** Budget editing is triggered from Expenses page (Set Budget / Edit This Month), not from the global FAB. Lock behavior is the same there.

---

## 6. Recommended safe refinements (completed)

1. **Single upgrade message** — Use `BUDGET_LOCK_UPGRADE_MESSAGE` everywhere (API 403 body and frontend upgrade modal). Done.
2. **Lock icon + clickable** — Locked budget actions show lock icon and open upgrade on click; no disabled-only buttons. Done.
3. **Preserve labels** — “Set Budget”, “Edit This Month”, “Edit Spending Plan” stay visible when locked, with lock icon. Done.
4. **No removal of expiry logic** — All existing entitlement checks and 403 behavior kept; only UX and messaging refined. Done.

---

## 7. Summary

- **Expiry logic:** Lives in `lib/entitlements.ts` and is used by `/api/features` and by budget-plan and budget-overrides write endpoints. Read endpoints do not check it.
- **Weak points:** Generic lock buttons, no lock icon, inconsistent upgrade message.
- **Refinements:** Central message constant, lock icon on all budget lock actions, same action labels when locked, upgrade modal shows “Upgrade to continue managing budgets beyond 30 days.” Existing data remains visible everywhere.
