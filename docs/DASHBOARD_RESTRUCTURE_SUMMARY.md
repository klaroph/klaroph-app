# Dashboard Restructure + Header Balance — Summary

**Date:** 2025-02-25  
**Scope:** 2-column layout (Momentum + Focus Goals), donut chart, header/sidebar balance.

---

## 1. Updated layout structure

- **Desktop:** Two columns — **45%** (Goal Momentum) | **55%** (Focus Goals), gap `var(--space-6)` (32px).
- **Tablet (≤1024px):** Single column, Momentum first, then Focus Goals.
- **Mobile (≤768px):** Single column; donut 180px; stats and Focus Goals stacked; no horizontal overflow.

**Implementation:** `.dashboard-two-col` with `grid-template-columns: 45% 55%`; at 1024px `1fr` and column order; at 768px spacing and donut size adjusted via existing tokens.

---

## 2. Donut chart component

- **New file:** `components/dashboard/GoalMomentumDonut.tsx`
- **Behavior:** SVG donut (track + progress circle), centered percentage, `role="img"` and configurable `ariaLabel`.
- **Sizing:** CSS `.goal-momentum-donut-wrap` — **240px** desktop, **180px** at 768px.
- **Stroke:** Radius 86, stroke 18 (balanced ring); track `var(--border-muted)`, fill `var(--color-primary)`; progress uses `strokeDasharray` / `strokeDashoffset`, rotated -90° so it starts at top.
- **Center text:** `--text-display` (32px), `tabular-nums`, primary color.
- **Animation:** Progress ring uses `transition: stroke-dashoffset var(--motion-medium) var(--ease-enter)`.

---

## 3. Left column — Goal Momentum (executive view)

- **Content:** Title “Goal Momentum” → Donut → three stats → encouragement.
- **Stats (order):** 1) Total Saved (₱), 2) Total Target (₱), 3) Total Active Goals. Values `--text-data-lg`, labels `--text-small`, vertical spacing `var(--space-2)` (8px).
- **Encouragement:**  
  - &lt;30%: “You're building momentum. Tuloy lang.”  
  - 30–70%: “You're halfway there. Stay consistent.”  
  - ≥70%: “Malapit na. You're almost there.”  
  Non-italic, weight 500, `--text-body`, `--text-primary`.
- **Removed:** Horizontal bar, “Manage All Goals” from this column; no extra decoration.
- **Styling:** `.goal-momentum-executive` — card with token padding, centered content, max-width on stats for readability.

---

## 4. Right column — Focus Goals

- **Unchanged:** Title “Focus Goals”, up to 3 goals (MarathonGoal cards), Add / Upgrade CTAs, empty and loading states.
- **New:** When `goals.length > 3`, a “Manage All Goals →” control (button) with 44px min-height; calls `onManageGoals`.
- **Grid:** `.goals-grid-focus` — 3 columns from 901px up, 1 column below; padding/min-height still from tokens (e.g. 16px, 140px).

---

## 5. Header adjustments

- **Logo size:** Sidebar logo `max-height` **72px → 50px** (≈30% smaller). Same 50px in collapsed (1024px) and drawer (768px) for consistency.
- **Header height:** Unchanged at **80px**; no expansion or cramping.
- **Tool icons:**  
  - Container: **40px × 40px**, `border-radius: 50%`, flex center.  
  - Icon: **24px** SVG (enforced via `.premium-tool-card-icon svg`).  
  - Same breathing animation and spacing (`var(--space-4)`) as before.

---

## 6. Icon sizing standardization

- **Header tool cards:** All four tools use the same 40px circular wrapper and 24px SVG; no per-tool scaling.
- **Spacing:** Gap between tool cards remains `var(--space-4)` (16px).
- **Animation:** Single `tool-icon-breathe` (scale 1.03, `--motion-ambient`); no change to clarity badge sweep timing.

---

## 7. Before / after layout balance

- **Before:** Full-width Momentum card (bar + metrics + button), then full-width Focus Goals card; donut absent; sidebar logo larger.
- **After:**  
  - **Left (45%):** One executive card — donut as main focus, then three stats and one line of encouragement.  
  - **Right (55%):** Focus Goals card with 3 goals and “Manage All Goals →” when applicable.  
  - Donut is the clear anchor; right column supports without competing.  
  - Header feels lighter (smaller logo, consistent 40px icon circles).

---

## 8. Responsive behavior

- **Desktop:** 45/55 grid, 32px gap.  
- **Tablet:** One column, Momentum first, same tokens.  
- **Mobile:** Donut 180px, `--space-4` padding, single-column focus list; no horizontal scroll.  
All spacing and typography use existing design tokens; no magic numbers.

---

## 9. Files touched

| File | Changes |
|------|--------|
| `components/dashboard/GoalMomentumDonut.tsx` | **New** — SVG donut, centered %, aria. |
| `components/dashboard/GoalMomentumSection.tsx` | Executive only: donut, 3 stats, encouragement; no bar, no button. |
| `components/dashboard/FocusGoalsSection.tsx` | “Manage All Goals →” when `goals.length > 3`. |
| `app/dashboard/page.tsx` | Wraps Momentum + Focus in `.dashboard-two-col` and column divs. |
| `app/globals.css` | Two-col grid, executive + donut styles, focus “Manage” link, sidebar logo 50px, tool icon 40px circle + 24px SVG. |

---

*Premium, calm, structured; typography and spacing from the defined token system only.*
