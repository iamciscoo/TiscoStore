import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PUBLIC_CATALOG_CACHE_CONTROL,
  shouldTrackCustomSession,
} from '../lib/performance-policy.ts'
import nextConfig from '../next.config.ts'

test('anonymous visitors do not invoke custom session analytics', () => {
  assert.equal(shouldTrackCustomSession(null, false), false)
})

test('authenticated visitors can be tracked unless do-not-track is enabled', () => {
  assert.equal(shouldTrackCustomSession('user-123', false), true)
  assert.equal(shouldTrackCustomSession('user-123', true), false)
})

test('public catalog responses are cached at the CDN with stale fallback', () => {
  assert.match(PUBLIC_CATALOG_CACHE_CONTROL, /^public, s-maxage=300,/)
  assert.match(PUBLIC_CATALOG_CACHE_CONTROL, /stale-while-revalidate=86400/)
})

test('global API headers do not override route cache policies', async () => {
  const rules = await nextConfig.headers()
  const globalApiRule = rules.find((rule) => rule.source === '/api/(.*)')
  const cacheHeader = globalApiRule?.headers.find(
    (header) => header.key.toLowerCase() === 'cache-control'
  )

  assert.equal(cacheHeader, undefined)
})

test('www redirects to the apex domain without invoking middleware', async () => {
  const redirects = await nextConfig.redirects()
  assert.ok(redirects.some((redirect) =>
    redirect.destination === 'https://tiscomarket.store/:path*' &&
    redirect.has?.some((condition) =>
      condition.type === 'host' && condition.value === 'www.tiscomarket.store'
    )
  ))
})
