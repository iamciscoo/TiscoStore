export const PUBLIC_CATALOG_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=86400'

export function shouldTrackCustomSession(
  userId: string | null | undefined,
  doNotTrack: boolean
): boolean {
  return Boolean(userId) && !doNotTrack
}
