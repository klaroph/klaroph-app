/**
 * Custom events for dashboard refetch. Use granular events so expense/income insert
 * does not trigger goals reload; goal insert does not trigger full transaction refetch.
 */
export const DASHBOARD_REFRESH_EVENT = 'klaroph-dashboard-refresh'
export const DASHBOARD_GOALS_REFRESH_EVENT = 'klaroph-dashboard-goals-refresh'
export const DASHBOARD_TRANSACTIONS_REFRESH_EVENT = 'klaroph-dashboard-transactions-refresh'

/** Full refresh (e.g. visibility change). Dispatches both goals and transactions. */
export function dispatchDashboardRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT))
  }
}

/** Only goals + allocations refetch (goal create/edit/delete). */
export function dispatchDashboardGoalsRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_GOALS_REFRESH_EVENT))
  }
}

/** Only transaction-related refetch (expense/income insert/update/delete). */
export function dispatchDashboardTransactionsRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_TRANSACTIONS_REFRESH_EVENT))
  }
}
