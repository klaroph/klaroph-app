# KlaroPH V2 — Design Language

Reference for the existing V2 direction (Dashboard, Ask Klaro, Landing, Onboarding, Upgrade).
This is documentation, not a framework. Tokens live in `app/klaroph-v2.css` (`:root`), loaded after `app/globals.css`.

## Visual hierarchy

Blue changed role in V2: deep blue anchors the brand, light blue is the environment.

```
DEEP KLARO BLUE   brand anchor   navbar, sidebar, reset/legal header bars, footer, headings
LIGHT BLUE        environment    page + hero + section backgrounds, empty states
WHITE             content        cards, forms, tables, modals, bottom nav bar
YELLOW            action         landing CTAs, Pro upgrade, mobile FAB, active nav indicator
GREEN             semantic       positive / success / healthy only
```

Large saturated blue fills are reserved for navigation chrome. Heroes and section bands use `--surface-environment` / `--color-bg` / `--color-primary-soft`, never a full blue gradient.

## Brand

| Role | Token | Use |
|---|---|---|
| KlaroPH blue | `--color-primary` `#0038A8` | Headings, links, form submit, selected tabs/filters |
| Navigation anchor | `--nav-anchor`, `--nav-text`, `--nav-text-muted`, `--nav-surface-hover`, `--nav-surface-active` | Sidebar/drawer and top bars |
| Blue soft | `--color-primary-soft` `#e8effc` | Selected states, info notes, callouts, closing CTA band |
| KlaroPH yellow | `--color-yellow` `#FCD116` | Action: landing CTAs, Pro upgrade, FAB, active nav indicator, headline marker |
| Yellow soft | `--color-yellow-soft` | "Best value" style badges |
| Page background | `--color-bg` `#eef5ff` · `--color-bg-deep` `#dfeafc` | Soft pastel blue behind white surfaces |
| Environment | `--surface-environment` | Light-blue vertical gradient for heroes |
| Pastels | `--pastel-sky`, `--pastel-periwinkle`, `--pastel-lavender`, `--pastel-coral`, `--pastel-peach` | Supporting fills (charts, snapshots, badges) |

Green is **semantic only** (success, healthy, completed). Never use it as a brand or decoration color.
Red is semantic only (errors, over budget, destructive).

Yellow on light backgrounds is never used for text — use it as a fill (buttons, marker highlight, indicator bar) with dark text.

## Background

- Authenticated surfaces, onboarding, and the landing hero use `--dashboard-atmosphere` (Philippine mountains / islands / sun) on a `::before` layer at ~0.4–0.55 opacity.
- Only the background layer is translucent — cards stay fully opaque white.
- Do not add more illustrations or raise opacity. The artwork is atmosphere, never content.

## Surfaces

- White cards: `background: var(--surface)`, `border: 1px solid var(--border-soft)`, `box-shadow: var(--shadow-card)`.
- Radii: `--radius-sm` 10px (inputs, small tiles) · `--radius-md` 16px (buttons, cards) · `--radius-lg` 20px (page cards, modals).
- One layout owner per region (parent **or** card **or** content). No nested giant containers.
- Avoid heavy shadows, gradients on cards, glassmorphism, and glossy effects.

## Typography

| Level | Size | Weight |
|---|---|---|
| Page title | `KlaroPageHeader` (≈24px desktop, 18px mobile) | 700 |
| Section title | 22–28px | 700 |
| Card title | 14–16px | 700 |
| Body | 14–15px, line-height 1.5–1.6 | 400–500 |
| Supporting | 13px, `--text-secondary` | 400 |
| Microcopy / labels | 11–12px, `--text-muted`, uppercase + letter-spacing for eyebrows | 600–700 |

Only the page hero may exceed 32px.

## Buttons

Reuse the existing classes — do not create new button systems.

| Variant | Class | Notes |
|---|---|---|
| Primary | `.btn-primary` | KlaroPH blue, 44px min height — standard form submit / confirm |
| Secondary | `.btn-secondary` | White with border |
| Ghost | `.btn-ghost` | Low-emphasis (e.g. "Maybe later", "Skip") |
| Danger | `.btn-danger` | Destructive only |
| Upgrade | `UpgradeCTA` / `.klaro-upgrade-cta` | Yellow — every Pro action (dashboard, Ask Klaro limit, landing Pro card, "Choose Pro") |
| Landing | `.landing-cta-primary` (yellow) / `.landing-cta-secondary` (white) | Landing hero and closing CTA |

Yellow is for the headline action of a surface (acquire, upgrade, quick add). Routine form submits stay blue so yellow keeps its meaning.

Selected tabs, filters, and segmented controls: solid `--color-primary` with white text (`.flow-filter-btn.active`, `.tool-segmented-btn.is-active`).

All buttons: visible `:focus-visible` ring (2px blue, 2px offset), disabled at reduced opacity with `not-allowed`, loading label ("Saving…", "Sending…").

## Forms

- Inputs/selects use `.login-input` (12px padding, 10px radius, blue border + soft 3px ring on focus).
- Labels above fields, 14px / 500.
- Errors: soft red block (`--color-error-bg`) with `role="alert"`; never color-only.
- Toggle choices use chips with `aria-pressed` (see `.onb-chip`, `.ask-klaro-suggestion`).

## Cards & empty states

- Cards are compact and purposeful; one idea per card.
- Empty states explain what's missing, why it matters, and offer one clear next action. They are never styled as errors.
- Status notes (limits, cooldowns) use the info style (`--color-primary-soft`), not the error style.

## Modals

Use `components/ui/Modal`:
- Clear title, short lead copy, content, primary + secondary action, close button (`aria-label="Close"`).
- `role="dialog"`, `aria-modal`, labelled by the title; Escape closes when outside-click closing is allowed.
- Mobile-safe width (`min(92vw, …)`), no walls of text.

## Plans & upgrade

- Feature lists come from `lib/planFeatures.ts` (includes Ask Klaro / Klaro Insight limits from `lib/ai/*`).
- Display prices come from `lib/planPricing.ts` (`NEXT_PUBLIC_CLARITY_PREMIUM_*_PESOS`). Checkout amounts are always server-side (`getSubscriptionPricing`).
- Describe Free positively ("Free includes…"). Pro copy says what Pro adds.
- CTA wording: app surfaces → "Upgrade to Pro"; upgrade modal → "Choose Pro"; landing → "Start free, then choose Pro".

## AI surfaces (Ask Klaro, Klaro Insight)

- Always mark Ask Klaro as **Beta** (`.landing-beta-badge` / `.ask-klaro-beta`, lavender pill).
- State the scope: "Ask Klaro can only answer using the financial information you track in KlaroPH."
- Never call it a financial advisor or imply access to banks, cards, or outside accounts.
- Klaro bubbles: light blue (`#f1f6ff`) + blue border + "Klaro" label. User bubbles: light lavender (`#f3f0fc`) + "You" label.

## Trust copy

Only claim what the product does. Allowed: "built on what you track", "calculated from your KlaroPH records", "Ask Klaro is limited to KlaroPH data".
Not allowed: "100% secure", "bank-grade security", "never stored", or any unverified security/AI claim.

## Accessibility

- Semantic headings in order; one `h1` per page.
- Every interactive element is a real `button`/`a` with an accessible name.
- Visible focus on everything; touch targets ≥ 44px.
- Never rely on color alone (labels, icons, or text accompany color).

## Responsive

Check 1440 / 1280 / 1024 / 768 / 430 / 390. Reflow (stack columns, full-width actions) rather than scaling down. No horizontal scrolling.
