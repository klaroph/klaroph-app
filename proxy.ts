import { createServerClient } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function redirectWithCookies(request: NextRequest, pathname: string, from: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  const redirectResponse = NextResponse.redirect(url)
  // Copy full cookie objects so refreshed tokens keep Supabase's maxAge/sameSite/secure.
  from.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
  return redirectResponse
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Request cookies let Server Components in this request see the rotated tokens
          // instead of refreshing again with the old refresh token.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Auth server unreachable: session state is unknown, so do not guard, redirect, or clear anything.
  if (error && isAuthRetryableFetchError(error)) {
    return response
  }

  const { pathname } = request.nextUrl

  if (!user && pathname.startsWith('/dashboard')) {
    return redirectWithCookies(request, '/', response)
  }

  if (user && (pathname === '/' || pathname === '/login')) {
    return redirectWithCookies(request, '/dashboard', response)
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
    '/onboarding',
    '/legal-update',
    '/admin/:path*',
  ],
}
