/**
 * Seed 1,000 expenses and print quick-add timings (median and max of 10).
 *
 *   cd mobile && npm run perf:quick-add
 *
 * The timed path writes one row and patches on-screen totals. It does not
 * reload the table or run a sync.
 */
export { seedExpenses, timeQuickAdds } from '../src/dev/quickAddPerf'
