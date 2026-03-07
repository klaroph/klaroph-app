# Clarity Premium – Test Scenarios & Coverage

Manual and automated scenarios for subscription, grace, and free-tier behavior.

---

## 1. Monthly subscription

| Scenario | Steps | Expected |
|----------|--------|----------|
| **Activation** | Create checkout with `plan_type: monthly` → complete payment | Subscription `status = active`, `plan_type = monthly`, `current_period_end` ≈ +1 month, `auto_renew = true`. |
| **Renewal** | Wait for period end (or simulate webhook `invoice.paid`) | `current_period_end` extended by 1 month. |
| **Payment failure → grace** | Webhook `subscription.invoice.payment_failed` or `past_due` | If `grace_period_used = false`: `status = past_due`, `grace_period_until` = now + 3 days, `grace_period_used = true`. |
| **Grace expiration → downgrade** | Call GET `/api/features` when `grace_period_until` is in the past | Subscription updated to `status = expired`, plan free; response shows free features. |
| **Cancel → retain until period end** | Call DELETE `/api/paymongo/subscription` | `auto_renew = false` only; `status` stays `active`; access until `current_period_end`. After period end, next GET `/api/features` downgrades to free. |

---

## 2. Annual subscription

| Scenario | Steps | Expected |
|----------|--------|----------|
| **Activation** | Create checkout with `plan_type: annual` | Subscription active, `plan_type = annual`, `current_period_end` ≈ +1 year. |
| **Cancel** | DELETE `/api/paymongo/subscription` | `auto_renew = false`; access until `current_period_end`. |
| **Renewal** | Webhook `invoice.paid` at period end | `current_period_end` extended by 1 year. |
| **Payment failure → grace** | Same as monthly; 3-day grace once. | `grace_period_used = true` so grace not reset on repeated failures. |

---

## 3. Free tier guardrails

| Scenario | Steps | Expected |
|----------|--------|----------|
| **Export** | GET `/api/analytics/export` as free user | 403, body `{ locked: true, reason: 'export' }`. |
| **3rd goal creation** | POST `/api/goals` with 2 goals already | 403, message about goal limit. |
| **Full history fetch** | Free user; query income/expenses with date before 90 days | RLS returns only rows with `date >= (current_date - 90 days)`; older data not returned. |
| **Date range beyond 90 days** | Free user selects "This Year" or custom range starting before cutoff | Upgrade modal triggered (smart trigger). |

---

## 4. Grace behavior

| Scenario | Steps | Expected |
|----------|--------|----------|
| **In grace** | `status = past_due`, `now() < grace_period_until` | `get_user_features` returns `plan_name = clarity_premium`, `is_grace = true`, `can_create_goals = false`. Full insight access; no new goals. |
| **Goal creation in grace** | POST `/api/goals` when `is_grace = true` | 403, message about payment update. |

---

## 5. Security & idempotency

| Scenario | Steps | Expected |
|----------|--------|----------|
| **Webhook signature** | POST to webhook with invalid or missing signature | 401/400; event not processed. |
| **Duplicate webhook** | Send same event id twice | Second request ignored (idempotency table); no double update. |
| **ENV at startup** | Remove e.g. `PAYMONGO_WEBHOOK_SECRET` and run `next build` or `next start` | App fails to start with clear error listing missing vars. |

---

## Running automated tests

```bash
npm run test
```

Coverage summary:

```bash
npm run test -- --coverage
```

See `**/*.test.ts` for unit tests (features helpers, plan limits, export/analytics route behavior with mocks).
