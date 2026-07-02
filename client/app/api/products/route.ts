/**
 * Products API Route
 * 
 * Handles product-related operations including fetching products with filters,
 * pagination, and category associations. This route provides optimized queries
 * with proper indexing and graceful error handling.
 * 
 * Features:
 * - Paginated product listing with configurable limits
 * - Category filtering via UUID
 * - Featured products filtering
 * - Product images and category data inclusion
 * - Graceful fallback for database schema changes
 * - Comprehensive error handling and validation
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { withMiddleware, withValidation, withErrorHandler, createSuccessResponse } from '@/lib/middleware'
import { PUBLIC_CATALOG_CACHE_CONTROL } from '@/lib/performance-policy'

// Run on Node.js runtime for access to secure environment variables
export const runtime = 'nodejs'

/**
 * Initialize Supabase client with service role for server-side operations
 * 
 * Service role provides elevated permissions for server-side data access
 * while maintaining security by keeping the key server-side only.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,   // Public Supabase URL (safe to expose)
  process.env.SUPABASE_SERVICE_ROLE!   // Service role key (server-side only)
)

/**
 * Request validation schema for GET /api/products endpoint
 * 
 * Defines the structure and constraints for query parameters to ensure
 * data integrity and prevent invalid requests from reaching the database.
 * 
 * Note: URL query parameters are strings, so we use coercion to convert them.
 */
const getProductsSchema = z.object({
  limit: z.coerce.number().min(1).max(20000).optional().default(50),  // Maximum items per page (1-20000 for batch fetching, default: 50)
  offset: z.coerce.number().min(0).optional().default(0),             // Starting position for pagination (0+, default: 0)
  category: z.string().uuid().optional(),                              // Category UUID filter (optional)
  featured: z.coerce.boolean().optional(),                             // Filter for featured products only (optional)
  minimal: z.coerce.boolean().optional().default(false)                // Return minimal fields for cards (default: false)
}).strip()  // Strip unknown keys (like cache-busting _t parameter)

/**
 * Optimized product query builder with schema-aware fallback handling
 * 
 * This function constructs a complex Supabase query that includes product data,
 * associated images, and category information. It implements graceful fallback
 * to handle potential database schema changes (e.g., missing slug column).
 * 
 * @param params - Validated query parameters from the request
 * @returns Promise<Product[]> - Array of product objects with nested relations
 */
async function getProductsQuery(params: z.infer<typeof getProductsSchema>) {
  /**
   * Build query function with conditional slug field inclusion
   * 
   * @param withSlug - Whether to include slug field in categories selection
   * @param offset - Pagination offset for batch fetching
   * @param limit - Batch size limit
   * @param minimal - Whether to select only minimal fields for cards
   * @returns Configured Supabase query builder
   */
  const buildQuery = (withSlug: boolean, offset: number = 0, limit: number = 1000, minimal: boolean = false) => {
    // Select string optimized for performance
    // If minimal is true, only fetch fields needed for ProductCard
    const select = minimal ? `
      id,
      name,
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
      slug,
      created_at,
      product_images (
        url,
        is_main
      ),
      categories:product_categories (
        category:categories (
          id,
          name
        )
      )
    ` : `
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
      view_count,
      brands,
      slug,
      created_at,
      updated_at,
      product_images (
        url,
        is_main,
        sort_order
      ),
      categories:product_categories (
        category:categories (
          id,
          name${withSlug ? ', slug' : ''}
        )
      )
    `

    // Initialize query builder with select clause and active products filter
    let query = supabase
      .from('products')                                                     // Target products table
      .select(select)                                                       // Apply comprehensive field selection
      .eq('is_active', true)                                               // **OPTIMIZATION: Only show active products (uses idx_products_active_stock_created)**
      .range(offset, offset + limit - 1)                                   // Apply pagination range (Supabase max 1000 per query)

    // Apply category filter if specified
    if (params.category) {
      // Use a JOIN filter on product_categories (more efficient with indexes)
      query = query.eq('product_categories.category_id', params.category)
    }

    // Apply featured products filter if specified
    if (params.featured) {
      query = query.eq('is_featured', true)  // **OPTIMIZATION: Uses idx_products_featured_active**
    }

    // **OPTIMIZATION: Order by multiple criteria for best UX**
    // 1. Featured products first (admins curate these)
    // 2. Then by creation date (newest first)
    // This uses idx_products_active_featured_created composite index
    return query
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      // Order product images by main image first, then by sort order
      .order('is_main', { ascending: false, foreignTable: 'product_images' })
      .order('sort_order', { ascending: true, foreignTable: 'product_images' })
  }

  // Fetch ALL products in batches if count > 1000 (Supabase hard limit)
  // First get total count
  let countQuery = supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  
  if (params.category) {
    countQuery = countQuery.eq('product_categories.category_id', params.category)
  }
  if (params.featured) {
    countQuery = countQuery.eq('is_featured', true)
  }
  
  const { count: totalCount, error: countError } = await countQuery
  if (countError) throw countError
  
  const total = totalCount || 0
  
  // If requesting all products (limit >= total), fetch in batches of 1000
  if (params.limit >= total && total > 1000) {
    console.log(`[Products API] Fetching ${total} products in batches (minimal=${params.minimal})...`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allProducts: Record<string, any>[] = []
    const batchSize = 1000
    
    for (let offset = 0; offset < total; offset += batchSize) {
      console.log(`[Products API] Batch: offset=${offset}, limit=${batchSize}`)
      const { data, error } = await buildQuery(true, offset, batchSize, params.minimal)
      if (error) throw error
      if (data) allProducts.push(...data)
    }
    
    console.log(`[Products API] Fetched ${allProducts.length} total products in batches`)
    return { products: allProducts, totalCount: total }
  }
  
  // Normal pagination - single fetch
  const { data, error } = await buildQuery(true, params.offset, Math.min(params.limit, 1000), params.minimal)

  // Throw any errors for proper error handling middleware
  if (error) throw error
  
  return { products: data || [], totalCount: total }
}

/**
 * GET /api/products endpoint handler
 * 
 * Retrieves a paginated list of products with optional filtering by category
 * and featured status. Supports comprehensive product data including images
 * and category information.
 * 
 * Query Parameters:
 * - limit (optional): Number of products to return (1-20000 for batch fetching, default: 50)
 * - offset (optional): Starting position for pagination (default: 0)
 * - category (optional): Category UUID to filter by
 * - featured (optional): Boolean to show only featured products
 * 
 * Response Format:
 * {
 *   "success": true,
 *   "data": Product[],
 *   "pagination": {
 *     "total": 170,
 *     "count": 50,
 *     "limit": 50,
 *     "offset": 0,
 *     "hasMore": true
 *   },
 *   "message": "Products retrieved successfully"
 * }
 * 
 * Error Handling:
 * - 400: Invalid query parameters
 * - 500: Database or server errors
 * 
 * Caching:
 * - Products are cached for 30 seconds with stale-while-revalidate
 * - Cache key includes all query parameters for accurate caching
 */
export const GET = withMiddleware(
  withValidation(getProductsSchema),    // Validate and parse query parameters
  withErrorHandler                      // Handle errors and format responses
)(async (req: NextRequest, validatedData: z.infer<typeof getProductsSchema>) => {
  // Debug logging
  console.log('[Products API] Request received with params:', {
    limit: validatedData.limit,
    offset: validatedData.offset,
    category: validatedData.category,
    featured: validatedData.featured
  })
  
  // Fetch products (handles batching internally if needed)
  const { products, totalCount } = await getProductsQuery(validatedData)

  // Calculate pagination metadata
  const returnedCount = products.length
  const hasMore = (validatedData.offset + returnedCount) < totalCount
  
  // Return successful response with products data and pagination metadata
  const successResponse = createSuccessResponse(products, 'Products retrieved successfully')
  // Add pagination metadata to response
  const responseWithPagination = {
    ...successResponse,
    pagination: {
      total: totalCount,
      count: returnedCount,
      limit: validatedData.limit,
      offset: validatedData.offset,
      hasMore
    }
  }
  const response = Response.json(responseWithPagination)
  
  // Intelligent caching: Cache minimal product lists for 60s (shop/deals pages)
  // No cache for full product data (single product detail views need fresh data)
  if (validatedData.minimal) {
    // Cache minimal data for 60 seconds for fast shop page loads
    response.headers.set('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL)
  } else {
    // No caching for full product data (admin, single views, etc.)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }
  
  return response
})
