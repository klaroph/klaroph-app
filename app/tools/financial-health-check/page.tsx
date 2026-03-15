import { redirect } from 'next/navigation'

/** Financial Health is now a dashboard module. Redirect old tool URL to dashboard. */
export default function FinancialHealthCheckRedirect() {
  redirect('/dashboard/financial-health')
}
