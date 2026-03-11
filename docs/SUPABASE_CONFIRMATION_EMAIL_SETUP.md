# Supabase confirmation email setup

If signup shows **"Error sending confirmation email"**, Supabase Auth is failing to send the confirmation email. Fix it by configuring **custom SMTP** in your Supabase project.

## Why it fails

- **Built-in sender**: Supabase’s default email is rate-limited (e.g. a few per hour) and not for production.
- **Authorized emails only**: Without custom SMTP, some plans only send to authorized (team) addresses.
- **Wrong SMTP**: If custom SMTP was enabled with bad credentials and then disabled, Supabase can still try to use it and fail.

## Fix: use custom SMTP (e.g. Resend)

You already use **Resend** for welcome and premium emails. Use the same for Auth:

1. **Resend**
   - [Resend](https://resend.com) → API Keys → create key.
   - Domains: add and verify your domain (e.g. `klaroph.com`).

2. **Supabase**
   - Dashboard → **Project Settings** (gear) → **Auth**.
   - Scroll to **SMTP Settings**.
   - **Enable Custom SMTP** and set:
     - **Sender email**: e.g. `hello@klaroph.com` (must be from a verified Resend domain).
     - **Sender name**: e.g. `KlaroPH`.
     - **Host**: `smtp.resend.com`
     - **Port**: `465` (SSL) or `587` (TLS).
     - **Username**: `resend`
     - **Password**: your **Resend API key** (not the same as `RESEND_API_KEY` in the app; you can use the same key).

3. **Save** and try signup again.

## Optional: test without confirmation

For local/dev only you can temporarily **disable “Confirm email”**:

- Dashboard → **Authentication** → **Providers** → **Email** → turn off **“Confirm email”**.

Do not leave this off in production.

## Template

The “Confirm sign up” body is in:

`supabase/email-templates/confirm-signup.html`

Paste it in: **Authentication** → **Email Templates** → **Confirm sign up** → **Body** (Source). Set **Subject** to e.g. `Confirm your email for KlaroPH`. The logo loads from `{{ .SiteURL }}/logo-klaroph-blue.png`; ensure **Site URL** is correct and the image is available at that path.
