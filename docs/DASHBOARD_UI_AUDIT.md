# KlaroPH Dashboard UI — Product Design Audit

**Auditor role:** Senior Product Design Auditor (Fintech standard)  
**Scope:** Dashboard UI — header, sidebar, goal momentum, focus goals, layout, typography, spacing, animation, brand, responsiveness, accessibility  
**Date:** 2025-02-25

---

## Executive summary

The dashboard has a clear information architecture and usable flows, but **visual consistency, typography scale, and premium feel are underdeveloped**. The header redesign (35/65 split, profile strip, tool cards) introduces several proportion and hierarchy issues. There is **no donut** in the current implementation — Goal Momentum uses a **horizontal progress bar**; the audit treats it as the “momentum” section. Responsiveness is minimal; animations are uncoordinated. The following scores and findings are strict and actionable.

---

## Scores (1–10)

| Dimension | Score | Notes |
|-----------|--------|--------|
| **Overall UX** | **5.5** | Usable and logical, but hierarchy and polish lag; header and sidebar compete for attention. |
| **Visual hierarchy** | **5** | Section titles and data lack a clear scale; header profile vs. tools balance is off. |
| **Consistency** | **4.5** | Font sizes and spacing are ad hoc; buttons and cards vary in style. |
| **Premium feel** | **5** | Some good tokens (blue, radius) but execution feels utilitarian, not premium. |
| **Cognitive load** | **6** | Structure is understandable; density and competing elements could be reduced. |

---

## Checklist audit

### Header

| Check | Finding |
|-------|--------|
| **Logo 350% proportionally balanced?** | **No.** Sidebar logo is 112px (350% of 32px). In a 240px-wide sidebar it dominates and can force horizontal scroll on small viewports. No max-width constraint in the component; CSS uses `max-height: 112px` and `max-width: 100%` but the requested “350% bigger” is applied without a clear visual balance test. **Recommendation:** Cap sidebar logo at ~56px height (or 72px max) and use `object-fit: contain` so it never overflows. |
| **Diagonal cut visually clean?** | **Partly.** `clip-path: polygon(0 0, 100% 0, calc(100% - 20px) 100%, 0 100%)` gives a 20px horizontal offset on the right. The angle is very subtle and can look like a rendering glitch. **Recommendation:** Either increase to 28–36px for a clearer slant or remove for a cleaner rectangle. |
| **Emboss effect subtle or overdone?** | **Overdone for “premium”.** Left column uses `linear-gradient(145deg, #e8eaef 0%, #dde0e8 100%)` and `box-shadow: inset 0 1px 0 rgba(255,255,255,0.4)`. The fill is ~30% darker than white; combined with the diagonal cut it feels heavy. **Recommendation:** Lighten to #f0f2f5 → #e6e9ef and reduce inset highlight so it reads as subtle depth. |
| **Clarity badge vs. tools competing?** | **Yes.** Clarity badge (10px font, sweep animation) and tool cards (11px label, 28px icon, breathe animation) sit in the same header. Two motion systems (sweep + breathe) and similar visual weight make the header busy. **Recommendation:** Tone down one animation (e.g. remove sweep or make it 6s and very low opacity) and reduce tool icon motion (e.g. scale 1→1.03, 3s). |
| **Breathing and shine animations clashing?** | **Yes.** Clarity badge: 4s sweep. Tool icons: 2.5s breathe (scale + opacity). Different durations and easing create a restless feel. **Recommendation:** Standardize on one duration (e.g. 3s) and one easing (e.g. `ease-in-out`); avoid simultaneous sweep + breathe in the same sight line. |
| **Spacing between nickname, clarity, completion consistent?** | **No.** Profile block uses `justify-content: space-between` with flex 60/25/15. Vertical rhythm is by percentage, not a spacing scale, so gaps feel arbitrary (10px padding, then uneven space between the three rows). **Recommendation:** Use a 4px or 8px grid: e.g. 8px between “Hi”, clarity badge, and completion block. |
| **Header height proportionate?** | **Borderline.** 80px is reasonable for desktop but leaves the profile strip (photo + 3 lines) and tools cramped. **Recommendation:** Consider 72px with slightly smaller type and icon, or 88px with more breathing room; lock to one canonical height and derive spacing from it. |

**Pixel-level suggestions (header):**

- Photo frame: keep 80px width; add 1px solid border (e.g. `var(--border)`) for “sharp lines” without looking flat.
- “Add photo” CTA: 11px font, 8px padding; ensure contrast on `#e8eaef` (currently blue on blue-muted is acceptable; verify 4.5:1).
- Hi + nickname: 16px → 15px, line-height 1.2, margin-bottom 6px.
- Clarity badge: 10px → 11px, padding 4px 10px; increase sweep animation to 6s and lower opacity of the sweep to 0.25.
- Tool card: icon 28px → 24px; label 11px; gap between label and icon 6px → 8px; breathing scale 1.08 → 1.04, duration 3s.

---

### Tool icon section (column 2)

| Check | Finding |
|-------|--------|
| **Circle icons proportionally sized?** | **N/A.** Icons are not circular; they are 28×28 SVG paths. Sizing is consistent at 28px. **Recommendation:** If “circle” was intended, consider circular containers (e.g. 40px circle with icon 24px); otherwise rename to “tool icons” and keep 24px for better balance with 11px label. |
| **Two-line header balanced?** | **Partly.** “FINANCIAL CLARITY” and “TOOLS” are both 10px, 0.06em / 0.2em letter-spacing. Line 2 feels heavier due to extra letter-spacing. **Recommendation:** Line 1: 10px; Line 2: 9px or same 10px with same letter-spacing; 2px gap between lines. |
| **Breathing animation too distracting?** | **Yes.** Four icons breathing at 2.5s (scale 1.08, opacity 0.92) draw the eye constantly. **Recommendation:** Reduce to scale 1.03 and 3.5s; or apply only on hover/focus. |
| **Icon + label spacing consistent?** | **Yes.** 6px gap between label and icon in tool cards. Card padding 8px 14px 10px is consistent. |
| **Section overpower dashboard content?** | **Yes.** Header (35% + 65%) has high contrast (darker left, white right), two animations, and four colored tool cards. It competes with “Your Goal Momentum” and “Focus Goals” below. **Recommendation:** Slightly desaturate or lighten tool card backgrounds; reduce icon size; remove or soften animation. |

**Recommended sizing scale (tool section):**

- Tagline: Line 1 — 10px, 600 weight; Line 2 — 9px or 10px, 600; gap 2px.
- Tool card: padding 10px 16px 12px; icon 24px; label 11px; gap 8px.
- Tool cards gap: 12px → 16px for clearer separation.

---

### Goal Momentum (bar section — not donut)

| Check | Finding |
|-------|--------|
| **Donut size proportionate?** | **N/A.** Implementation is a **horizontal bar** (height 10px), not a donut. If a donut is required, this is a structural gap. |
| **% readable at glance?** | **N/A for donut.** Aggregate progress is shown only by bar width; there is **no numeric %** in the momentum section. Users must infer from bar length. **Recommendation:** Add a single prominent “X%” (e.g. 24px, tabular-nums) beside or above the bar. |
| **Total saved/target too small?** | **Yes.** Values are 20px, labels 12px. For a key metric this is undersized for “at a glance” scanning. **Recommendation:** Total Saved and Total Target: 24px or 22px; labels 12px; use `formatCurrency` and tabular-nums. |
| **Encouragement message too subtle?** | **Yes.** 14px italic, `var(--text-secondary)`; low emphasis. **Recommendation:** 14px, non-italic, weight 500; consider `var(--text-primary)` or a dedicated token; 4px margin-top above it. |
| **Left column heavier than right?** | **N/A.** Single full-width card; no left/right split. Grid for the three metrics is `repeat(auto-fit, minmax(140px, 1fr))` — balanced. |

**Ideal adjustments (momentum):**

- Add one clear “X% overall” (e.g. 28px) with a short label “Overall progress”.
- Bar: height 10px → 12px; border-radius 6px; ensure 2:1 contrast on track vs. fill.
- Metrics: Total Goals / Total Saved / Total Target — 22px value, 12px label, 8px gap; use lib `formatCurrency` and `.tabular-nums`.
- “Manage All Goals”: keep as primary CTA; ensure 44px min touch target.

---

### Focus Goals column

| Check | Finding |
|-------|--------|
| **Cards consistent height?** | **Partly.** Grid is `repeat(3, 1fr)` with gap 16px. Content (name, amount, bar, “View Details”) can vary; cards stretch to equal height. Marathon goal compact padding 14px 0; grid cell padding 16px. **Recommendation:** Set a min-height (e.g. 140px) so empty or short content doesn’t create uneven blocks. |
| **Padding consistent?** | **Mostly.** `.goals-grid .marathon-goal` has 16px; MarathonGoal inner has 14px 0. Slight inconsistency. **Recommendation:** Single padding value for the card (e.g. 16px all sides). |
| **Progress bars aligned?** | **Yes.** Each MarathonGoal has its own track; alignment is per card. |
| **“Manage All Goals” clear enough?** | **Yes.** It’s a primary button in the momentum card. “View Details” per goal is a text link — acceptable. |
| **Right column cramped?** | **N/A.** Focus Goals is full width. If “right column” means the tool area in the header, see header/tool section. |

---

### Sidebar

| Check | Finding |
|-------|--------|
| **Collapsed width optimal?** | **N/A.** There is **no collapsed state**. Sidebar is fixed 240px. For mobile/tablet this is a major gap. |
| **Icons centered properly?** | **Partly.** `.sidebar-link` uses `display: flex; align-items: center; gap: 12px`. Icons are 24×24 (viewBox). Visual alignment is acceptable. **Recommendation:** Explicit icon size (e.g. width/height 20px) for consistency. |
| **Active indicator clear in collapsed mode?** | **N/A.** No collapsed mode. In expanded state, `.sidebar-link.active` has left border 3px yellow and background — clear. |
| **Spacing between nav items consistent?** | **Yes.** `.sidebar-nav` gap 4px; `.sidebar-link` padding 12px 16px — consistent. |

**Recommendations (sidebar):**

- Introduce a responsive behavior: e.g. &lt; 1024px hide sidebar and use a top bar + hamburger, or collapse to icon-only (e.g. 64px width) with tooltips.
- Logo: reduce effective size (see header section) so it doesn’t dominate; keep aspect ratio.

---

## Typography scale

**Current usage (from codebase):**  
10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 52px — **no defined scale.**

| Role | Current | Issue |
|------|--------|--------|
| H1 | 52px (landing), 22px (dashboard top bar legacy) | Not used on dashboard; no single H1 size. |
| H2 | 24px (page-header) | OK for sectioning. |
| Section / card title | 16px (dash-card-title) | Too close to body; hierarchy weak. |
| Card title | 15px (marathon-goal-name), 16px (dash-card-title) | Inconsistent. |
| Body | 14px, 15px | Mixed. |
| Muted | 12px, 13px (text-muted, text-secondary) | OK. |
| Data numbers | 20px, 22px (momentum); 14px (marathon pct) | Inconsistent; some too small. |

**Suggested scale (example):**

- **Display:** 32px (optional, e.g. hero number).
- **H1:** 24px.
- **H2 / Section:** 20px.
- **H3 / Card title:** 16px.
- **Body:** 14px.
- **Small / Muted:** 12px.
- **Data (emphasis):** 20px or 22px, tabular-nums.
- **Data (secondary):** 14px.

Define these as CSS custom properties (e.g. `--text-display`, `--text-h1`, …) and replace ad hoc font-size values.

---

## Spacing system

**Current:** Margins and paddings use 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48px — **no grid.**

**Issues:**

- `marginBottom: 24` (Goal Momentum) vs `marginBottom: 16` (inner grid) vs `marginBottom: 20` (free plan banner) — inconsistent vertical rhythm.
- Card padding: dash-card 24px; goals-grid cards 16px; mixed.
- Header padding: left 10px 16px 10px 14px; right 0 24px — different horizontal rhythm.

**Recommended system (8px grid):**

- Base unit 8px. Allow 4px for tight UI (e.g. icon gaps).
- Section spacing: 24px (3 units) or 32px (4 units) between major blocks.
- Card internal: 16px or 24px.
- Inline gaps: 8px or 12px.

Document in design tokens (e.g. `--space-1` … `--space-6`) and use consistently.

---

## Brand consistency

| Check | Finding |
|-------|--------|
| **Yellow intentional?** | **Underused.** Yellow appears in sidebar active state (border), MarathonGoal (runner dot, flag), and as `--color-warning`. It doesn’t feel like a core brand element in the dashboard. **Recommendation:** Either use yellow sparingly for success/milestone (e.g. 100% goal) or remove and stick to blue + neutral. |
| **Blue consistent?** | **Mostly.** Primary blue (#0038A8) is used for primary actions, links, clarity badge. Muted blue for backgrounds. Consistent. |
| **Too many accent colors?** | **Yes.** Blue, green (success), red (error/loan), yellow (13th), yellow (warning) — four accent families in one header. **Recommendation:** Limit header tools to one accent (e.g. all blue-muted with primary text) or two (e.g. blue + neutral). |
| **Premium tone maintained?** | **No.** Mix of 10px type, heavy gradient panel, and bright tool cards reads more “utility” than “premium.” **Recommendation:** Softer backgrounds, one accent, more whitespace, and a clear type scale. |

---

## Animation audit

| Check | Finding |
|-------|--------|
| **Purposeful?** | **Partly.** Breathe on tool icons is decorative; clarity sweep is decorative. Neither communicates state. |
| **Distracting?** | **Yes.** Multiple always-on motions in one view. |
| **Durations consistent?** | **No.** 2.5s (breathe), 2s (hover), 4s (sweep), 0.3s (progress fill), 0.15s (transitions). |
| **Easing consistent?** | **Mostly.** ease-in-out used for breathe and sweep; ease for 0.15s transitions. |

**Recommendation:**

- **Standard durations:** 150ms (micro), 300ms (UI feedback), 2500–3000ms (ambient, if kept).
- **Standard easing:** `ease-out` for enter, `ease-in` for exit; `ease-in-out` for ambient.
- **Reduce motion:** Add `prefers-reduced-motion: reduce` and disable or simplify sweep and breathe (e.g. no scale, no sweep).

---

## Responsiveness

| Area | Current | Issue |
|------|--------|--------|
| **Header stacking on mobile** | No breakpoints for header. | At ~768px and below, 35% + 65% and tool cards will squeeze or wrap poorly. |
| **Sidebar on tablet** | Fixed 240px. | No collapse or overlay; eats space on tablet. |
| **Tool icons wrapping** | `flex-wrap: wrap` with gap 12px. | Will wrap; no dedicated mobile layout. |
| **Goal Momentum + Focus stacking** | Momentum is one column (grid auto-fit); Focus is 3 columns then 1 at 900px. | Single breakpoint at 900px; no intermediate. |
| **Main content padding** | 32px. | Not reduced on small viewports. |

**Structural suggestions:**

- **&lt; 1024px:** Header: stack left column above right; or left 100% width, right 100% below; photo + profile lines in one row.
- **&lt; 768px:** Sidebar → overlay/drawer with toggle; main content full width; header single column; tool row horizontal scroll or 2×2 grid.
- **Spacing:** Reduce main padding to 16px or 20px below 768px.
- **Touch:** Min 44px height for all interactive targets (buttons, links, tool cards).

---

## Accessibility risks

| Risk | Severity | Note |
|------|----------|------|
| **Focus visibility** | Low | `:focus-visible` is styled globally; verify all custom controls receive focus ring. |
| **Color contrast** | Medium | Text on #e8eaef and on blue-muted backgrounds (e.g. clarity badge, tool cards) — verify 4.5:1 for normal text, 3:1 for large. |
| **Motion** | Medium | No `prefers-reduced-motion`; sweep and breathe can affect vestibular users. |
| **Touch targets** | Medium | “Add photo”, “Complete Profile →”, clarity badge may be &lt; 44px; “View Details” link needs adequate hit area. |
| **Heading order** | Low | Section titles (e.g. “Your Goal Momentum”, “Focus Goals”) should be consistent (e.g. h2 vs h3) for screen readers. |
| **Live regions** | Low | Loading and error states (e.g. “Loading…”) — consider `aria-live` for dynamic updates. |

---

## Top 10 critical fixes

1. **Define and apply a single typography scale** (e.g. 32/24/20/16/14/12) and replace one-off font-sizes.
2. **Adopt an 8px (or 4px) spacing system** and use it for margins, paddings, and gaps (section, card, header).
3. **Reduce header visual noise:** one motion only (e.g. keep breathe, remove or soften sweep); lighten left column fill; consider 28–36px diagonal cut or remove.
4. **Add explicit “X%” to Goal Momentum** and use `formatCurrency` + tabular-nums for Total Saved/Target.
5. **Sidebar logo:** cap size (e.g. max-height 56–72px) so it doesn’t dominate or overflow on small widths.
6. **Tool icon animation:** reduce to scale 1.03 and 3s, or restrict to hover/focus; add `prefers-reduced-motion`.
7. **Unify button styles:** single primary and secondary style (padding, radius, font-size) for “Manage All Goals”, “Complete Profile →”, “+ Add New Goal”, “Upgrade to Pro”.
8. **Responsive header and sidebar:** add breakpoints for header stacking and sidebar collapse/overlay below 1024px.
9. **Contrast and touch:** audit text on tinted backgrounds (header left, badges, tool cards); ensure 44px min height for CTAs.
10. **Limit header accent colors** to one or two (e.g. blue + neutral) for a more premium, consistent look.

---

## Top 5 quick wins

1. **Add “X%” to Goal Momentum** (one number above or beside the bar) — 1 line of content + reuse of percent calculation.
2. **Lighten header left column** to #f0f2f5 → #e6e9ef and reduce inset shadow — CSS only.
3. **Tool icon breathing:** change to `scale(1.03)` and 3.5s — CSS only.
4. **Clarity badge sweep:** increase to 6s and lower sweep opacity to 0.25 — CSS only.
5. **Cap sidebar logo** with `max-height: 72px` and `width: auto` in `.sidebar-logo img` — CSS only.

---

## Structural improvements

- **Design tokens file:** Centralize type scale, spacing scale, and animation (duration/easing) in CSS custom properties or a token file.
- **Component audit:** One primary button component, one secondary, one text link style; apply across dashboard and modals.
- **Layout grid:** Define a 12-column grid for main content and align cards/sections to it (e.g. momentum full width, focus goals 3 columns on large).
- **Header layout variants:** Implement `header--stacked` (or similar) for &lt; 1024px and test with real content (long nickname, many tools).
- **Sidebar:** Implement collapsed (icon-only) or overlay state and document breakpoint and behavior.

---

## Long-term design maturity

- **Design system:** Typography, spacing, color, and components in a single source of truth (tokens + Storybook or equivalent).
- **Accessibility:** Full WCAG 2.1 AA pass (contrast, focus, motion, labels, landmarks).
- **Responsive:** Mobile-first breakpoints (e.g. 360, 768, 1024, 1280) with defined layouts and touch targets.
- **Animation policy:** Document when to use motion (feedback vs. ambient) and always respect `prefers-reduced-motion`.
- **Quality bar:** No one-off font-sizes or magic numbers; all values from tokens or the spacing/type scale.

---

*End of audit. No code was changed; recommendations are measurable and implementable in follow-up tasks.*
