# KlaroPH — Architecture & Session Rules

This document is the single source of truth for the KlaroPH project. Follow it in all sessions related to KlaroPH. Reference it at the start of work (e.g. "follow docs/ARCHITECTURE.md").

---

## 1. Project Context

KlaroPH is a **financial empowerment web app for Filipinos**.

KlaroPH is:

- A **savings-first** financial control system
- Focused on **goals-driven budgeting**
- Built for **long-term scalability**
- Architected **securely from day one**

This is **NOT** a prototype.  
This is an **MVP built with production discipline**.

---

## 2. Tech Stack

**Frontend:**

- Next.js (App Router)
- TypeScript
- No external UI libraries
- Inline styling only for now

**Backend:**

- Supabase
- Postgres (default engine)
- Supabase Auth (Email + Google OAuth)
- Row Level Security (RLS) enforced on all tables

---

## 3. Security Rules (Non-Negotiable)

You **MUST NOT**:

- Modify database schema
- Modify Supabase RLS policies
- Disable RLS
- Change authentication logic
- Expose service_role key
- Add backend API routes unless explicitly asked
- Introduce new auth flows
- Modify supabaseClient configuration
- Introduce new libraries without approval

All financial data must respect:

- `auth.uid() = user_id`

All inserts **MUST** attach:

- `user_id: user.id`

---

## 4. Existing Database Tables (Locked)

Tables already created:

- `assets`
- `liabilities`
- `goals`
- `income_records`
- `income_allocations`
- `expenses`

Important columns:

**goals:**

- `id` (uuid)
- `user_id` (uuid)
- `name` (text)
- `target_amount` (numeric)

**expenses:**

- `id`
- `user_id`
- `category` (text)
- `type` ('needs' | 'wants')
- `amount`
- `date`

You are **NOT** allowed to alter these schemas.

---

## 5. Current File Structure

Project root:

```
klaroph-app/
  app/
    page.tsx
    login/page.tsx
  lib/
    supabaseClient.ts
  .env.local
```

Authentication is already working.

Dashboard page:

- Detects logged-in user
- Supports logout
- Uses `supabase.auth.getSession` + `onAuthStateChange`

---

## 6. Product Vision

KlaroPH is structured around **3 pillars**:

1. **Savings-First Goals System**
2. **Spending Discipline (Needs vs Wants)**
3. **Financial Position (Assets vs Liabilities)**

- Savings allocation happens **before** spending.
- Spending classification drives behavioral insights.
- AI insights will be added later.
- **Current focus:** Clean MVP foundation.

---

## 7. Development Rules

When generating code:

- Keep components modular
- Use reusable components
- No global state libraries (no Redux, no Zustand)
- No UI frameworks
- Keep logic simple
- Prefer explicit code over clever abstractions
- Always handle loading state
- Always handle error state
- Never bypass RLS assumptions

---

## 8. Role of the Assistant

You are a **controlled implementation assistant**.  
You are **NOT** the system architect.

You **must**:

- Follow constraints strictly
- Ask for clarification if something violates rules
- Never assume schema changes
- Never add features outside scope
- Return full file code when requested (do not return partial snippets unless asked)
