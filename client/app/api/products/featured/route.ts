import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { withMiddleware, withValidation, withErrorHandler, createSuccessResponse } from '@/lib/middleware'
import { PAGINATION_LIMITS, applyListOptimizations } from '@/lib/optimized-queries'
import { PUBLIC_CATALOG_CACHE_CONTROL } from '@/lib/performance-policy'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

const getFeaturedProductsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(PAGINATION_LIMITS.featured),
  _t: z.number().optional() // Cache-busting timestamp
}).passthrough() // Allow other query params

// GET /api/products/featured
export const GET = withMiddleware(
  withValidation(getFeaturedProductsSchema),
  withErrorHandler
)(async (req: NextRequest, validatedData: z.infer<typeof getFeaturedProductsSchema>) => {
  const getFeaturedProductsQuery = async () => {
    const buildQuery = (withSlug: boolean) => {
      const query = supabase
        .from('products')
        .select(`
          id,
          name,
          description,
          price,
          image_url,
          stock_quantity,
          is_featured,
          is_new,
          is_deal,
          deal_price,
          original_price,
          rating,
          reviews_count,
          brands,
          slug,
          created_at,
          featured_order,
          product_images(
            url,
            is_main,
            sort_order
          ),
          categories:product_categories!fk_product_categories_product_id (
            category:categories (
              id,
              name${withSlug ? ', slug' : ''}
            )
          )
        `)
        .eq('is_featured', true)        // **ONLY featured products**
        .eq('is_active', true)          // **OPTIMIZATION: Only show active products**
        .gte('stock_quantity', 0)       // **OPTIMIZATION: Only show products with stock info**
      
      // **OPTIMIZATION: Order product images by main first**
      const queryWithImageOrder = query
        .order('is_main', { foreignTable: 'product_images', ascending: false })
        .order('sort_order', { foreignTable: 'product_images', ascending: true })
      
      // Apply optimized ordering using helper
      return applyListOptimizations(queryWithImageOrder)
    }

    const { data, error } = await buildQuery(true)
    if (error) throw error
    return data || []
  }

  // This executes only on a CDN miss; the response policy serves repeat traffic.
  console.log('🔄 Fetching featured products from the database')
  const allFeaturedProducts = await getFeaturedProductsQuery()
  
  // **SPARSE POSITIONING LOGIC**
  // 1. Separate products with explicit positions from those without
  type FeaturedProduct = typeof allFeaturedProducts[number]
  const productsWithPosition = allFeaturedProducts.filter((p: FeaturedProduct) => p.featured_order != null)
  const productsWithoutPosition = allFeaturedProducts.filter((p: FeaturedProduct) => p.featured_order == null)
  
  // 2. Create sparse array with exact positions (1-20)
  type ProductOrNull = FeaturedProduct | null
  const positionedArray: ProductOrNull[] = new Array(validatedData.limit).fill(null)
  
  // 3. Place products at their exact positions
  productsWithPosition.forEach((product: FeaturedProduct) => {
    const position = product.featured_order! - 1 // Convert to 0-indexed
    if (position >= 0 && position < validatedData.limit) {
      positionedArray[position] = product
    }
  })
  
  // 4. Find empty slots
  const emptySlots: number[] = []
  for (let i = 0; i < validatedData.limit; i++) {
    if (positionedArray[i] === null) {
      emptySlots.push(i)
    }
  }
  
  // 5. Randomly assign products without explicit positions to empty slots
  const shuffledProducts = [...productsWithoutPosition].sort(() => Math.random() - 0.5)
  shuffledProducts.forEach((product, index) => {
    if (index < emptySlots.length) {
      positionedArray[emptySlots[index]] = product
    }
  })
  
  // 6. Filter out null values for return (keep sparse structure)
  const data = positionedArray

  const response = Response.json(createSuccessResponse(data))
  
  response.headers.set('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  response.headers.set('Vary', 'Accept-Encoding')
  
  return response
})
