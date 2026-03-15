# Date handling (internal)

- Never use `new Date('YYYY-MM-DD')` — Safari (and others) treat it as UTC; use local construction or `parseLocalDateString`.
- Use **`parseLocalDateString`** for date-only strings (API, state, CSV).
- Use **`toLocalDateString`** for calendar output (keys, filters, DB date columns).
- Use **`toISOString`** only for timestamps (e.g. `created_at`, subscription periods, logs).
- Finance records (expenses, income, budgets) are **calendar dates**, not UTC timestamps.

Helpers: `lib/format.ts` (`toLocalDateString`, `parseLocalDateString`).
