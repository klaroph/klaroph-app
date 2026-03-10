# Welcome Email — Infrastructure Audit (Pre-Implementation)

**Purpose:** Verify infrastructure before implementing welcome email. Do not implement until confirmed.

---

## 1. RESEND_API_KEY in Vercel production

**Status:** **Not verifiable from codebase.**

- No `RESEND` or `resend` reference exists in the repo.
- No `.env.example` or docs that mention Resend.
- **Action:** Manually confirm in **Vercel → Project → Settings → Environment Variables** that `RESEND_API_KEY` is set for **Production** (and optionally Preview if you test there). If missing, add it and redeploy.

---

## 2. Sender email identity (hello@klaroph.com)

**Status:** **Not configured in codebase.**

- Repo only references `support@klaroph.com` (privacy page).
- Sender identity is configured in **Resend Dashboard**, not in app code (domain verification, from address).
- **Action:** In **Resend Dashboard**: add and verify domain `klaroph.com`, add sender identity `hello@klaroph.com`. Ensure the identity is verified and usable for sending. Without this, sends will fail or go to spam.

---

## 3. Current signup success flow location

**Two distinct points:**

| Flow | Location | When it runs |
|------|----------|----------------|
| **Client: “Signup submitted”** | `components/auth/SignUpModal.tsx` | After `supabase.auth.signUp()` succeeds; shows “Check your email”. No server call; user not yet confirmed. |
| **Server: “Account confirmed / first session”** | `app/auth/callback/route.ts` | When user clicks email confirmation link (or OAuth redirect). Runs `exchangeCodeForSession(code)` then redirects to `/dashboard`. |

**Welcome email should trigger from the server flow** (after the user is confirmed and has a session), not from the client modal. The only server-side place that sees “signup success” for both email confirmation and OAuth is **`app/auth/callback/route.ts`**.

---

## 4. Safest backend route for sending email

**Recommended:** Send the welcome email from **inside `app/auth/callback/route.ts`** after a successful `exchangeCodeForSession`, when you decide the user is “new” (e.g. first time this user hits callback, or a short time since `user.created_at`).

**Why:**

- Runs only on the server after a real session exists.
- No extra public API surface; no client can call “send welcome email” directly.
- Has access to the same request/cookies and can read `data.session.user` (and profile) for email and name.

**Alternative (also safe):** Add a **server-only API route** (e.g. `POST /api/send-welcome-email`) that:

- Requires an authenticated session (e.g. cookie).
- Accepts no body or only a non-secret idempotency key.
- Sends at most one welcome email per user (e.g. flag in `profiles` or a small `welcome_email_sent_at` column).

Then **auth/callback** calls that route internally (e.g. `fetch(origin + '/api/send-welcome-email', { credentials: 'include' })` or a shared server function) so email logic stays in one place and is testable. Both approaches are safe; the simplest is “send inside auth/callback” with a sentinel to avoid duplicate sends.

---

## 5. Auth flow exposing user email and first name

**Yes.** In `app/auth/callback/route.ts` after `exchangeCodeForSession`:

- **Email:** `data.session.user.email` (string, always set for email signups; OAuth may also set it).
- **Name:**  
  - `data.session.user.user_metadata?.full_name` (OAuth often sets this).  
  - Or read `profiles.full_name` from DB (Supabase trigger `handle_new_user()` sets `full_name` to `COALESCE(raw_user_meta_data->>'full_name', NEW.email)`).

So **email** and **full name** (or email as fallback for “first name”) are available server-side in the callback. No extra auth or profile fetch is required beyond what callback already does (or can do with one more `profiles` select including `full_name`).

---

## Required missing steps (checklist)

1. **Vercel:** Confirm `RESEND_API_KEY` exists for Production (and add it if missing).
2. **Resend:** Verify domain `klaroph.com` and add/verify sender identity `hello@klaroph.com`.
3. **Idempotency:** Decide how to avoid sending the welcome email more than once per user (e.g. `profiles.welcome_email_sent_at` or a similar flag and one-time send in callback).

---

## Safest implementation order

1. **Confirm infrastructure**  
   - Add/confirm `RESEND_API_KEY` in Vercel.  
   - Add/verify `hello@klaroph.com` in Resend.

2. **Add idempotency**  
   - Add a column or table to record that the welcome email was sent (e.g. `profiles.welcome_email_sent_at`).  
   - Or check an existing “first login” signal so the send is effectively once per user.

3. **Implement send in one place**  
   - Either: in `app/auth/callback/route.ts` after successful `exchangeCodeForSession`, if “new user” and not already sent, call Resend (or a small internal helper) with `user.email` and name from `user.user_metadata` or `profiles.full_name`.  
   - Or: add `POST /api/send-welcome-email` (auth-required, server-only), and call it from auth/callback; inside the route, check idempotency and send via Resend.

4. **Use only server-side data**  
   - Do not pass email or name from the client. Read them in callback (or in the API route from session + profile).

5. **Test**  
   - Test email signup and OAuth signup; confirm one welcome email per user and no duplicate sends after refresh or second login.

---

**Summary:** Resend is not yet integrated. Confirm `RESEND_API_KEY` and `hello@klaroph.com` in Vercel and Resend, then implement sending from the auth callback (or a dedicated server-only API route called from callback) with idempotency so the welcome email is sent once per user using only server-side email and name.
