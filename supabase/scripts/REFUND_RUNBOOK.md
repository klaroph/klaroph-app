# Manual Pro refund

Refunds stay manual. There is no refund webhook. Edit `supabase/scripts/revoke_pro_after_refund.sql`, then run it once.

1. Edit the four values in the `DO` block: `v_user_id`, `v_payment_id` (the PayMongo payment id), `v_reason`, and `v_operator`. The script refuses to run while those still hold the placeholder text.
2. Run it in one transaction:

```bash
supabase db query -f supabase/scripts/revoke_pro_after_refund.sql
```

The script sets that user's subscription to `is_lifetime = false`, the free plan, and `status = 'canceled'`. In the same transaction it inserts `payment_events` with `event_type` `manual.refund` and `event_id` `manual.refund:<payment id>`. The payload stores the payment id at `data.attributes.data.id` and `data.attributes.data.attributes.payment_id`.

Migration B reads those two paths from any event whose type contains `refund`. After this script, that payment is not a verified payment, so migration B will not grant it.

Run the script again only with a different payment id. The same `event_id` is unique and a second insert fails, which rolls the transaction back.
