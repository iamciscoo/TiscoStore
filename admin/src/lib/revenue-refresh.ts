export const REVENUE_REFRESH_INTERVAL_MS = 60_000

export function shouldRefreshRevenue(
  lastFetchedAt: number,
  now: number,
  minimumIntervalMs = REVENUE_REFRESH_INTERVAL_MS
): boolean {
  return now - lastFetchedAt >= minimumIntervalMs
}
