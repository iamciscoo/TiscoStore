import { createClient } from '@supabase/supabase-js'
import { withMiddleware, withErrorHandler, createSuccessResponse } from '@/lib/middleware'
import { PUBLIC_CATALOG_CACHE_CONTROL } from '@/lib/performance-policy'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

// GET /api/categories
export const GET = withMiddleware(
  withErrorHandler
)(async () => {
  // This executes only on a CDN miss; the response policy serves repeat traffic.
  console.log('🔄 Fetching categories from the database')
  
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) throw error

  const response = Response.json(createSuccessResponse(data))
  
  response.headers.set('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  
  return response
})
