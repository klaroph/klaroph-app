import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options ?? { path: '/' })
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()

  // If NOT logged in and trying to access dashboard
  if (!user && url.pathname.startsWith('/dashboard')) {
    url.pathname = '/'
    const redirectResponse = NextResponse.redirect(url)
    response.cookies.getAll().forEach(({ name, value }) => {
      redirectResponse.cookies.set(name, value, { path: '/' })
    })
    return redirectResponse
  }

  // If logged in and trying to access landing or login
  if (user && (url.pathname === '/' || url.pathname === '/login')) {
    url.pathname = '/dashboard'
    const redirectResponse = NextResponse.redirect(url)
    response.cookies.getAll().forEach(({ name, value }) => {
      redirectResponse.cookies.set(name, value, { path: '/' })
    })
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
  ],
}
