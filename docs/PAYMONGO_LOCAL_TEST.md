# PayMongo Webhook – Local + ngrok Testing

Use this to verify the webhook and subscription flow when developing locally with ngrok.

---

## 1. Confirm environment variables

Next.js loads `.env.local` automatically when you run `npm run dev`. No extra config needed.

**Required in `.env.local`:**

| Variable | Used by |
|----------|--------|
| `PAYMONGO_SECRET_KEY` | Create-checkout API |
| `PAYMONGO_WEBHOOK_SECRET` | Webhook route (signature verification) |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhook route (subscriptions + payment_events) |
| `NEXT_PUBLIC_SUPABASE_URL` | supabaseAdmin (webhook) |
| `NEXT_PUBLIC_APP_URL` | Create-checkout (success/cancel URLs) – set to your ngrok URL |

**Optional – Clarity Premium pricing:**

| Variable | Default | Used by |
|----------|---------|--------|
| `CLARITY_PREMIUM_MONTHLY_CENTAVOS` | 14900 (₱149) | Create-checkout (server) – monthly price in centavos |
| `NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS` | 149 | Upgrade modal (client) – monthly price for display. Annual = 12 × monthly × 0.8 (Save 20%). |

**Quick check:** Temporarily remove `PAYMONGO_WEBHOOK_SECRET` and send any POST to the webhook URL. You should get **500** with body `{"error":"Webhook not configured"}`. Restore the secret afterward.

---

## 2. Confirm webhook URL uses ngrok

PayMongo must reach your app over **HTTPS**. Your webhook URL should be:

```text
https://YOUR-NGROK-URL.ngrok-free.app/api/paymongo/webhook
```

Use this exact URL when creating the webhook in PayMongo (or when you created it). If you change the ngrok URL, create a new webhook in PayMongo pointing to the new URL.

---

## 3. Trigger a test payment (PayMongo test mode)

1. **Start the app and ngrok**
   - Terminal 1: `npm run dev`
   - Terminal 2: `ngrok http 3000` (or your dev port)
   - Set `NEXT_PUBLIC_APP_URL` in `.env.local` to the ngrok HTTPS URL (e.g. `https://abc123.ngrok-free.app`).

2. **Log in** to your app (via ngrok URL so redirects stay on ngrok).

3. **Open Upgrade modal**
   - Dashboard → “Upgrade to Pro” (or “Upgrade” where you show it).

4. **Start checkout**
   - Click “Upgrade to Pro” in the modal.
   - You should be redirected to PayMongo’s hosted checkout.

5. **Pay with test method**
   - Use [PayMongo test cards / e-wallets](https://developers.paymongo.com/docs/testing) (e.g. test card or test GCash/Maya if documented).
   - Complete payment so PayMongo sends `checkout_session.payment.paid`.

---

## 4. Confirm webhook was hit

**Option A – Terminal**

In the terminal where `npm run dev` is running, look for:

- `[Webhook] Subscription activated for user <uuid> via checkout <session_id>`

If you see `[Webhook] Invalid signature` or `[Webhook] PAYMONGO_WEBHOOK_SECRET is not set`, fix the secret or env loading.

**Option B – Supabase**

1. Supabase Dashboard → **Table Editor** → `payment_events`.
2. After a successful test payment you should see a new row:
   - `event_type` = `checkout_session.payment.paid`
   - `payload` = JSON of the event.

**Option C – Manual webhook test (no real payment)**

You can send a fake POST to the webhook; it will fail signature verification (401) unless you compute a valid HMAC. That’s expected and confirms the route is reachable and verifying the secret.

---

## 5. Confirm subscriptions table updated

1. Supabase Dashboard → **Table Editor** → `subscriptions`.
2. Find the row for your test user (`user_id` = the logged-in user’s UUID).
3. After a successful webhook you should see:
   - `plan_id` = Pro plan’s UUID (from `plans` where `name = 'pro'`)
   - `status` = `active`
   - `payment_provider` = `paymongo`
   - `paymongo_checkout_session_id` = PayMongo checkout session ID
   - `current_period_start` / `current_period_end` = this month / next month

---

## 6. Confirm feature unlock in the app

1. After the webhook has run, refresh the dashboard (or go to `/dashboard/upgrade-success` if you were redirected there).
2. The app calls `get_user_features()` (via `/api/features`), which reads from `subscriptions` + `plans`.
3. You should see:
   - No “Free plan” banner (or Pro messaging).
   - `plan_name: "pro"`, `max_goals: 20` (e.g. in network tab or by being able to add more than 2 goals).

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| 500 “Webhook not configured” | `PAYMONGO_WEBHOOK_SECRET` in `.env.local`; restart `npm run dev`. |
| 401 “Invalid signature” | Webhook in PayMongo created with the same secret you put in `PAYMONGO_WEBHOOK_SECRET`; use **raw** request body for signature (we use `request.text()`). |
| 401 “Stale webhook” | PayMongo sent the event late; tolerance is 5 minutes. For testing you can temporarily increase tolerance in `lib/paymongo.ts` `isTimestampFresh`. |
| Webhook not called | PayMongo webhook URL must be your **ngrok HTTPS** URL; ngrok must be running; no firewall blocking. |
| payment_events empty | Webhook returned non-2xx before insert (e.g. signature failed); check terminal and PayMongo webhook logs. |
| subscriptions not updated | Check terminal for `[Webhook] ... missing user_id in metadata` or “Pro plan not found”; ensure checkout session was created with `metadata.user_id` (create-checkout sets it from `user.id`). |

---

## Summary checklist

- [ ] `.env.local` has `PAYMONGO_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (ngrok).
- [ ] Webhook in PayMongo points to `https://YOUR-NGROK-URL/api/paymongo/webhook`.
- [ ] Run `npm run dev`, ngrok, then do a test payment.
- [ ] Terminal shows “Subscription activated for user …”.
- [ ] `payment_events` has a row for `checkout_session.payment.paid`.
- [ ] `subscriptions` for your user shows Pro plan, `active`, `paymongo`.
- [ ] Dashboard shows Pro (e.g. no free banner, 20 goals).
