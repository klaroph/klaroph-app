/**
 * Custom event used when goal, income, or expense is added/updated from FAB or elsewhere.
 * Dashboard, income, expenses, and goals pages listen for this to refetch so the current
 * page and dashboard stay in sync (important for mobile FAB flows).
 */
export const DASHBOARD_REFRESH_EVENT = 'klaroph-dashboard-refresh'

export function dispatchDashboardRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT))
  }
}
