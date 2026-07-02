import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Use Node.js runtime to support Supabase APIs
export const runtime = 'nodejs'

// Public routes that don't require authentication
const publicRoutes = [
  '/',
  '/products',
  '/product',
  '/services',
  '/deals',
  '/contact',
  '/faq',
  '/track-order',
  '/delivery-guide',
  '/about',
  '/auth',
  '/cart', // Cart should be accessible without auth
  '/search', // Search should be accessible
  '/checkout', // Let AuthGuard handle UI - don't redirect
  '/account', // Let AuthGuard handle UI - don't redirect
  '/terms',
  '/privacy',
  '/cookies',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.json',
  '/browserconfig.xml',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon-96x96.png',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/logo-email.png',
  '/api/products',
  '/api/categories',
  '/api/services',
  '/api/reviews',
  '/api/deals',
  '/api/contact-messages',
  '/api/newsletter',
  '/api/payments/mobile/webhook',
  '/api/notifications/email', // Manual email sending - public
  '/api/admin',
  '/api/auth', // Auth endpoints should be accessible
]

// Check if route is public
function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(route => {
    if (route.endsWith('*')) {
      return pathname.startsWith(route.slice(0, -1))
    }
    return pathname === route || pathname.startsWith(route + '/')
  })
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Handle www to non-www redirect (permanent 301) - BEFORE any processing
  const hostname = request.headers.get('host') || ''
  if (hostname.startsWith('www.')) {
    const url = request.nextUrl.clone()
    url.host = hostname.replace('www.', '')
    return NextResponse.redirect(url, { status: 301 })
  }

  // Fast path: Skip auth for webhooks and certain auth endpoints
  if (pathname.startsWith('/api/payments/mobile/webhook') || 
      pathname.startsWith('/api/webhooks') ||
      (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/sync')) {
    return NextResponse.next()
  }

  // Fast path: Skip Supabase client creation for truly public routes
  const isPublic = isPublicRoute(pathname)
  if (isPublic && !pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          try {
            const cookieValue = request.cookies.get(name)?.value
            if (!cookieValue) return undefined
            
            // Validate Supabase auth cookies to prevent UTF-8 errors
            if (name.includes('supabase') || name.includes('auth')) {
              try {
                // Test if the cookie value is valid UTF-8
                const testString = decodeURIComponent(encodeURIComponent(cookieValue))
                if (testString !== cookieValue) {
                  console.warn(`Invalid UTF-8 in middleware cookie ${name}, ignoring`)
                  return undefined
                }
                
                // For JWT tokens, validate base64 structure
                if (cookieValue.includes('.')) {
                  const parts = cookieValue.split('.')
                  if (parts.length >= 2) {
                    try {
                      atob(parts[1])
                    } catch {
                      console.warn(`Invalid JWT in middleware cookie ${name}, ignoring`)
                      return undefined
                    }
                  }
                }
              } catch (error) {
                console.warn(`Middleware cookie validation failed for ${name}:`, error)
                return undefined
              }
            }
            
            return cookieValue
          } catch (error) {
            console.warn(`Error reading middleware cookie ${name}:`, error)
            return undefined
          }  
        },
        set(name: string, value: string, options) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Note: pathname and isPublic already checked above before Supabase client creation
  // For public API routes, still check if they need auth
  if (isPublic && pathname.startsWith('/api/')) {
    // Public API routes still get response with session cookies
    return response
  }

  // For protected routes, check authentication
  try {
    // Try to get session first, then user
    const { data: { session } } = await supabase.auth.getSession()
    
    // If we have a session, verify the user
    let user = session?.user || null
    if (!user && session) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      user = authUser
    }

    if (!user) {
      // For API routes, return 401 (they need auth)
      if (pathname.startsWith('/api/')) {
        // Check if it's a protected API route
        const protectedApiRoutes = [
          '/api/orders',
          '/api/payments/mobile',
          '/api/service-bookings',
          '/api/auth/profile',
          '/api/auth/sync',
          '/api/auth/addresses',
          '/api/notifications/admin-order',
          '/api/notifications/welcome'
        ]
        
        const isProtectedApi = protectedApiRoutes.some(route => pathname.startsWith(route))
        if (isProtectedApi) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }
      }
      
      // For protected pages, let them load (AuthGuard will handle UI)
      // No redirect - let the page load and AuthGuard will show modal
    }
  } catch (error) {
    console.error('Auth error in middleware:', error)
    
    // If it's a UTF-8 error, clear all auth cookies and redirect/return 401
    if (error instanceof Error && error.message.includes('UTF-8')) {
      console.log('Clearing corrupted auth cookies due to UTF-8 error')
      
      // Create response to clear cookies
      const clearResponse = NextResponse.next({
        request: {
          headers: request.headers,
        },
      })
      
      // Clear all Supabase auth cookies
      const cookiesToClear = [
        'sb-hgxvlbpvxbliefqlxzak-auth-token',
        'sb-hgxvlbpvxbliefqlxzak-auth-token.0',
        'sb-hgxvlbpvxbliefqlxzak-auth-token.1',
        'supabase-auth-token',
        'supabase.auth.token'
      ]
      
      cookiesToClear.forEach(cookieName => {
        clearResponse.cookies.set({
          name: cookieName,
          value: '',
          expires: new Date(0),
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'lax'
        })
      })
      
      // For API routes, return 401 with cleared cookies
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Authentication session expired' },
          { status: 401, headers: clearResponse.headers }
        )
      }
      
      // For pages, let them load (AuthGuard will handle UI) but clear cookies
      return NextResponse.next({ headers: clearResponse.headers })
    }
    
    // For other auth errors, treat as unauthenticated
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication error' },
        { status: 401 }
      )
    }
    
    // For pages, let them load (AuthGuard will handle UI)
    // No redirect needed
  }

  return response
}

export const config = {
  matcher: [
    // Public storefront pages and catalog APIs do not need server-side auth.
    // Keeping them out of middleware avoids a Fluid invocation on every visit.
    '/api/orders/:path*',
    '/api/payments/mobile/:path*',
    '/api/service-bookings/:path*',
    '/api/auth/profile/:path*',
    '/api/auth/sync/:path*',
    '/api/auth/addresses/:path*',
    '/api/notifications/admin-order/:path*',
    '/api/notifications/welcome/:path*',
  ],
}
