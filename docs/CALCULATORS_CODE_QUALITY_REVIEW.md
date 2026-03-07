# Calculators – Code Quality Review

Reviewed: Salary (page + modal), 13th Month Pay (page + modal), Loan (page + modal).

---

## Strengths

- **Clear structure**: Each calculator has a single responsibility, `useMemo` for derived state, and consistent “hasInput + show — when empty” pattern.
- **Types**: Props and state are typed; `InputMode`, result shapes are clear.
- **Documentation**: Salary compute functions have JSDoc (SSS/PhilHealth/Pag-IBIG/tax rules).
- **Accessibility (modals)**: Salary, 13th Month, and Loan modals use `aria-label` on inputs.
- **Consistent UX**: Result sections always visible with “—” when no input; “Open full calculator →” in modals.

---

## Issues & Recommendations

### 1. Duplication (Salary) – High

- **Issue**: `computeSSS`, `computePhilHealth`, `computePagIBIG`, `computeMonthlyWithholdingTax`, and the result computation are duplicated between `app/dashboard/tools/salary/page.tsx` and `components/dashboard/SalaryCalculatorModal.tsx`. `Row` and `Divider` are also duplicated.
- **Risk**: Formula or rate changes must be updated in two places; easy to miss one.
- **Recommendation**: Extract salary math to a shared module (e.g. `lib/salaryCalculations.ts`) and have both page and modal import it. Optionally extract `Row`/`Divider` to a small shared UI file or keep in one place and import.

### 2. Accessibility (Pages) – Medium

- **Issue**: Salary page inputs have no `aria-label`. 13th Month and Loan page inputs also have no `aria-label`. Modals already have them.
- **Recommendation**: Add `aria-label` (and where relevant `aria-describedby` for helper text) to all calculator page inputs so behavior matches modals and screen readers get clear names.

### 3. Magic numbers – Low

- **Issue**: 13th month uses `90000` (taxable threshold) inline. Loan uses formula constants inline (acceptable).
- **Recommendation**: Define a constant for the 13th month threshold (e.g. `THIRTEENTH_MONTH_TAXABLE_THRESHOLD = 90_000`) and use it in both page and modal.

### 4. Currency formatting – Low

- **Issue**: All six files use the same pattern: `` `${value < 0 ? '-' : ''}&#8369;${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` ``. `lib/format.ts` has `formatCurrency` but uses parentheses for negatives and no decimals by default.
- **Recommendation**: Either extend `formatCurrency` (e.g. option for minus sign and fixed decimals) and use it in calculators, or add a `formatCurrencyPHP(value, decimals?)` that matches current behavior and use it everywhere to avoid repetition and drift.

### 5. Loan edge case – Very low

- **Issue**: For very large `termMonths` (e.g. 10000), `Math.pow(1 + r, n)` can become Infinity and break the formula.
- **Recommendation**: Cap `n` (e.g. max 600 months) or guard and show a message for out-of-range term. Optional unless you need to support extreme terms.

### 6. Consistency (labels and styles) – Low

- **Issue**: Some labels use inline `fontWeight: 500`, others use a mix; 13th/Loan pages use `marginBottom: 6`, salary uses `marginBottom: 4` in places. Minor.
- **Recommendation**: Use a shared label style constant or CSS class for calculator form labels so spacing and weight are consistent.

---

## Summary

| Area           | Severity | Action |
|----------------|----------|--------|
| Salary duplication | High   | Extract to `lib/salaryCalculations.ts` |
| A11y on pages  | Medium   | Add `aria-label` to all page inputs |
| Magic numbers | Low      | Constant for 13th month ₱90k |
| Currency format | Low    | Reuse or extend `lib/format.ts` |
| Loan term cap  | Optional | Cap or validate `termMonths` |
| Label styles   | Low      | Optional shared label style |

Implementing the high/medium items (shared salary lib, aria-labels, 13th month constant) will improve maintainability and accessibility with minimal risk.
