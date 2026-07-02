import type { NextConfig } from "next";

// Allow remote images from the project's Supabase storage domain, if configured
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

const remotePatterns: NonNullable<NextConfig['images']>['remotePatterns'] = []
try {
  if (SUPABASE_URL) {
    const { hostname } = new URL(SUPABASE_URL)
    remotePatterns.push({
      protocol: 'https',
      hostname,
      pathname: '/storage/v1/object/public/**'
    })
  }
} catch {}

// Allow Google profile images (e.g., Google OAuth avatars)
remotePatterns.push({
  protocol: 'https',
  hostname: 'lh3.googleusercontent.com',
})

// Allow Pexels images for product photos
remotePatterns.push({
  protocol: 'https',
  hostname: 'images.pexels.com',
})

// Allow Unsplash images for product photos
remotePatterns.push({
  protocol: 'https',
  hostname: 'images.unsplash.com',
})

// Allow placeholder images (fallback for products without images)
remotePatterns.push({
  protocol: 'https',
  hostname: 'via.placeholder.com',
})

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 1080, 1920],
    imageSizes: [64, 128, 256, 384],
    minimumCacheTTL: 31536000, // Cache images for 1 year
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    qualities: [75],
    // Increase timeout for large images from Supabase storage
    loader: 'default',
    loaderFile: undefined,
  },
  trailingSlash: false,
  output: 'standalone',
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Force Node.js runtime for middleware and API routes using Supabase
  serverExternalPackages: ['@supabase/supabase-js', '@supabase/ssr'],
  experimental: {
    optimizePackageImports: ['@radix-ui/react-avatar', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.tiscomarket.store',
          },
        ],
        destination: 'https://tiscomarket.store/:path*',
        permanent: true,
      },
      {
        source: '/sign-in/:path*',
        destination: '/auth/sign-in',
        permanent: true,
      },
    ]
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production'
    
    return [
      {
        source: '/sitemap.xml',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/xml',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/services/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy - Comprehensive XSS protection
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://js.stripe.com https://checkout.stripe.com https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' blob:",
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://vitals.vercel-insights.com wss://*.supabase.co https://api.zenopay.net",
              "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests"
            ].join('; ')
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Strict referrer policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // Permissions Policy (restrict dangerous features)
          {
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'microphone=()',
              'geolocation=()',
              'interest-cohort=()',
              'payment=(self)',
              'usb=()',
              'bluetooth=()',
              'autoplay=(self)',
              'fullscreen=(self)'
            ].join(', ')
          },
          // HSTS (only in production with HTTPS)
          ...(isProduction ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          }] : []),
          // Cross-Origin policies
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin'
          }
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // CSRF protection header
          {
            key: 'X-CSRF-Protection',
            value: 'required'
          }
        ],
      },
      // Webhook endpoints need special handling
      {
        source: '/api/payments/mobile/webhook',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: 'https://api.zenopay.net'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'POST'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          }
        ]
      }
    ]
  },
};

export default nextConfig;
