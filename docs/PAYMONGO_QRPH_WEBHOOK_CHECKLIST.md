# PayMongo QRPH Webhook Checklist

When QR payment succeeds in PayMongo but Supabase subscription does not update, the webhook is usually not reaching the app or not subscribed to the right event.

## Alignment with PayMongo docs

- **QR Ph API**: <https://developers.paymongo.com/docs/qr-ph-api>  
  We use: Create Payment Intent → Create QR Ph payment method (`expiry_seconds: 600`) → Attach → display `next_action.code.image_url`.  
  On success, PayMongo sends a **`payment.paid`** event (not `checkout_session.payment.paid`).

- **Customizing QR Ph Code Expiry**: <https://developers.paymongo.com/docs/customizing-qr-ph-code-expiry>  
  We set `expiry_seconds: 600` when creating the payment method; timer starts on attach.

- **Linking Payment Intent ID**: <https://developers.paymongo.com/docs/retriving-payment-intent-id-from-qrph-invoice-number>  
  Our handler reads `payment_intent_id` from the payment in the webhook payload, then fetches the Payment Intent to get `metadata` (user_id, plan, plan_type) and activates the subscription.

## 1. Webhook must subscribe to `payment.paid`

In **PayMongo Dashboard → Developers → Webhooks**:

1. Open your webhook (or create one).
2. **Event types**: ensure **`payment.paid`** is selected.  
   - Checkout redirect flow uses `checkout_session.payment.paid`.  
   - **QRPH uses `payment.paid`.** If only checkout events are selected, QR payments will never trigger your handler.
3. Add `payment.paid` if missing, save.

## 2. Webhook URL and secret

- **URL**: `https://<your-domain>/api/paymongo/webhook` (must be HTTPS, publicly reachable).
- **Secret**: Copy the webhook signing secret from the dashboard and set `PAYMONGO_WEBHOOK_SECRET` in your environment (Vercel/env). If the secret is wrong, signature verification can fail; the app currently continues on mismatch for debugging—see webhook route.

## 3. Verify payment shows in PayMongo

- **Payments**: <https://dashboard.paymongo.com/payments>  
  Confirm the QR payment appears and status is paid.
- Optional: use the 6-digit QRPH invoice number from the customer receipt to search; from the payment you can get the Payment Intent ID (see [Linking the Payment Intent ID](https://developers.paymongo.com/docs/retriving-payment-intent-id-from-qrph-invoice-number)).

## 4. After fixing subscription

1. Re-save the webhook in the dashboard (with `payment.paid` selected).
2. Trigger a new QR payment (new QR, pay with test/live as appropriate).
3. Check server logs for:
   - `[Webhook] Processing event_id=... type=payment.paid`
   - `[Webhook] payment.paid (QRPH) subscription insert user_id=...`
   - `[Webhook] payment.paid subscription success ...`

If you see `payment.paid` in logs but subscription still not updated, the next place to check is `handlePaymentPaid` (metadata, Supabase upsert, RLS).
