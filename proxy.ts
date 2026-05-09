import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // --- Age gate check ---
  // Skip the gate only for /verify itself and static/api routes
  const ageVerified = request.cookies.get('alyra_age_verified')
  const ageGateExempt = ['/verify', '/auth', '/_next', '/favicon.ico', '/api/']
  const isExempt = ageGateExempt.some((p) => pathname.startsWith(p))

  if (!ageVerified && !isExempt) {
    return NextResponse.redirect(new URL('/verify', request.url))
  }

  const protectedPaths = ['/dashboard', '/call', '/credits']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  // --- Supabase session refresh + auth guard ---
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect logged-in users away from /login
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback).*)',
  ],
}
