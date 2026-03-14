import { NextResponse } from 'next/server'

/**
 * Reserved for PayMongo credit card / redirect checkout confirmation.
 * When using PayMongo checkout with a redirect (e.g. success_url pointing here),
 * this route can verify the checkout session and then redirect the user to the app.
 * Currently redirects to upgrade-success; extend later to verify session_id and sync subscription.
 */
export async function GET(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  const url = baseUrl && typeof baseUrl === 'string' && baseUrl.trim()
    ? baseUrl.trim().replace(/\/$/, '')
    : request.url.replace(/\/api\/paymongo\/confirm-checkout.*$/, '')
  const redirectTo = `${url}/dashboard/upgrade-success`
  return NextResponse.redirect(redirectTo)
}
