/**
 * Custom event name used when goal, income, or expense is added/updated from FAB or elsewhere.
 * Pages (dashboard, income, expenses) listen for this to refetch data immediately.
 */
export const DASHBOARD_REFRESH_EVENT = 'klaroph-dashboard-refresh'

export function dispatchDashboardRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT))
  }
}
