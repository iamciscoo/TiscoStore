import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldRefreshRevenue } from '../src/lib/revenue-refresh.ts'

test('revenue refresh is throttled while the admin tab remains active', () => {
  assert.equal(shouldRefreshRevenue(10_000, 40_000), false)
  assert.equal(shouldRefreshRevenue(10_000, 70_000), true)
})
