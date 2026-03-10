# Welcome Email — Google Signup Path Audit

**Purpose:** Verify whether auth callback runs before the profiles row exists during OAuth (Google) login, and whether welcome-email idempotency can break. Return exact failure point before changing logic.

---

## 1. Does profile select return null immediately after Google callback?

**Yes, it can.**

- Profile is created by DB trigger `on_auth_user_created` (AFTER INSERT on `auth.users`). Supabase Auth inserts the user, then the trigger runs in the same Postgres transaction and inserts into `public.profiles`.
- In theory the profile row exists by the time `exchangeCodeForSession(code)` returns. In practice:
  - Replication or propagation delay can make the new row not visible to a follow-up query.
  - The callback already assumes timing issues: it uses a **retry loop** (2 attempts, 250 ms delay) and the comment says *"profile may have just been created by trigger"*.
- The callback uses `.single()`. When no row exists, Supabase returns `{ data: null, error }`. So `row` is null and `profile` stays **null** after both attempts if the row is not yet visible.

**Conclusion:** On first-time Google signup, the profile select can return null (profile row absent or not yet visible) even after the retry.

---

## 2. Does welcome email block skip when profile row is absent?

**No. It does not skip — that is the bug.**

Current condition:

```ts
if (profile?.welcome_email_sent_at == null && data.session.user.email)
```

When `profile` is **null**:

- `profile?.welcome_email_sent_at` is **undefined**.
- In JavaScript, `undefined == null` is **true**.
- So the condition is **true** and we **enter** the welcome-email block even when the profile row is missing.

We then:

1. Send the welcome email (we have `data.session.user.email` and `user_metadata.full_name`).
2. Call `supabaseAdmin.from('profiles').update({ welcome_email_sent_at: now }).eq('id', userId)`.

If the profile row does not exist yet, the update affects **0 rows**, so `welcome_email_sent_at` is never persisted. Idempotency is lost.

---

## 3. Can idempotency still work safely with user metadata + later profile update?

**Not with the current logic when profile is null.**

- We **do** send the email when profile is null (see above).
- We **cannot** record that we sent it, because there is no row to update.
- On the **next** login the profile exists (trigger has run and is visible), with `welcome_email_sent_at` still **null**, so we send the welcome email **again**.

So with the current code, idempotency does **not** hold for the “profile missing on first callback” case: we send on first callback, fail to persist the timestamp, then send again on next login.

Using only user metadata (e.g. a flag in `user_metadata`) would require writing from the app into Auth user metadata and is a different design. The current design relies on `profiles.welcome_email_sent_at` only; that is safe only when we run the welcome-email block when a profile row **exists** so the update can persist.

---

## 4. Exact failure point (before changing logic)

**Where it breaks:**

- **Location:** `app/auth/callback/route.ts`, welcome-email block (lines ~99–118).
- **Condition:** `if (profile?.welcome_email_sent_at == null && data.session.user.email)`.
- **Failure scenario:**
  1. First-time Google signup; callback runs after `exchangeCodeForSession`.
  2. Profile select returns null (row not yet visible after 2 attempts).
  3. Consent update runs; with no row it updates 0 rows (no-op).
  4. Welcome-email condition is **true** because `profile?.welcome_email_sent_at` is `undefined` and `undefined == null`.
  5. We send the welcome email.
  6. We call `update({ welcome_email_sent_at: now }).eq('id', userId)`; 0 rows updated.
  7. Redirect happens; user never sees an error.
  8. Next login: profile now exists with `welcome_email_sent_at === null` → we send the welcome email again.

**Exact failure point in one sentence:**  
We send the welcome email when `profile` is null (because `undefined == null`), then try to persist idempotency on a row that does not exist, so the send is not recorded and we send again on the next login.

---

## 5. Recommended safest behavior (no logic changed yet)

- **If profile exists and `welcome_email_sent_at` is null**  
  → Send welcome email, then update `welcome_email_sent_at` with current timestamp.  
  (This is already correct when `profile` is non-null.)

- **If profile is missing**  
  → Treat as “first auth, profile not yet visible.”  
  → **Do not send** in this request (we cannot safely record the send).  
  → **Do not** treat as “already sent” (no silent permanent skip).  
  → On a **later** request (next login or next time callback runs), profile will exist; then if `welcome_email_sent_at` is still null, send once and update. That preserves one-time send and idempotency.

**Concrete change (for implementation):**  
Only run the welcome-email block when a profile row is present, so we can always persist the timestamp when we send:

- Require `profile != null` (e.g. `profile && profile.welcome_email_sent_at == null && data.session.user.email`).
- When `profile` is null, skip the block; no send, no update. Next login will have profile and will send once and update.

This avoids duplicate sends and keeps idempotency safe without using user metadata or changing the rest of the auth flow.
