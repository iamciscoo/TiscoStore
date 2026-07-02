import { createClient } from '@supabase/supabase-js'
import { withMiddleware, withErrorHandler, createSuccessResponse } from '@/lib/middleware'
import { PUBLIC_CATALOG_CACHE_CONTROL } from '@/lib/performance-policy'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

// GET /api/brands - Fetch unique brands from products
export const GET = withMiddleware(
  withErrorHandler
)(async () => {
  console.log('🔄 Fetching unique brands from products')
  
  const { data, error } = await supabase
    .from('products')
    .select('brands')
    .not('brands', 'is', null)

  if (error) throw error

  // Extract unique brands from the array fields
  const uniqueBrands = new Set<string>()
  data?.forEach(product => {
    if (Array.isArray(product.brands)) {
      product.brands.forEach((brand: string) => {
        if (brand && brand.trim()) {
          uniqueBrands.add(brand.trim())
        }
      })
    }
  })

  // Convert to sorted array
  const brands = Array.from(uniqueBrands).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  )

  const response = Response.json(createSuccessResponse(brands))
  
  response.headers.set('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  
  return response
})
