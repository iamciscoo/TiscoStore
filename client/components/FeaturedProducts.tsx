"use client";
import { ProductCard } from "@/components/shared/ProductCard";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export const FeaturedProducts = () => {
  const [products, setProducts] = useState<(Product | null)[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        // Fetch featured products with minimal fields and caching for fast home page load
        const response = await fetch(`/api/products/featured?limit=30&minimal=true`, {
          // Allow 60-second cache for performance
          next: { revalidate: 60 }
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          console.error('Featured products API error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          if (isMounted) setProducts([]);
          return;
        }
        
        const result = await response.json();
        const data = result.data || result;
        
        // Handle sparse array - keep null values for empty slots
        if (isMounted) setProducts(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to load featured products:", e);
        if (isMounted) setProducts([]);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);
  
  // Derived lists for layouts (preserve ordering, hide nulls in UI)
  const nonNullProducts = products.filter((p): p is Product => p !== null);
  const mobileSliderProducts = nonNullProducts.slice(0, 10);
  let mobileGridProducts = nonNullProducts.slice(10, 30);
  // Avoid a single card on the last row in 3-col grid (hide the last one if remainder is 1)
  if (mobileGridProducts.length % 3 === 1) {
    mobileGridProducts = mobileGridProducts.slice(0, -1);
  }
  return (
    <section className="pt-2 pb-2 bg-white w-full overflow-hidden">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-3">
            Featured{" "}
            <span className="relative inline-block">
              <span className="relative z-10">Highlights</span>
              <span className="absolute bottom-1 left-0 w-full h-3 bg-gradient-to-r from-blue-500 to-blue-600 opacity-30 -skew-y-1"></span>
            </span>
          </h2>
          <p className="text-gray-600 mb-4 sm:mb-5 text-base md:text-lg">
            We picked them, you love them. Items you&apos;ll regret missing out on.
          </p>
        </div>

        {/* Mobile Layout - Slider + Grid */}
        <div className="md:hidden">
          {/* First 10 products - Horizontal Slider */}
          <div className="mb-8">
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 pl-4 -mr-4 pr-4">
              {mobileSliderProducts.map((product) => (
                <div key={product.id} className="min-w-[65%] snap-start">
                  <ProductCard
                    product={product}
                    compact
                    className="rounded-xl border border-gray-100"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Remaining products (11-30) - 3 Column Grid */}
          {mobileGridProducts.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-8">
              {mobileGridProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  compact
                  className="rounded-xl border border-gray-100"
                />
              ))}
            </div>
          )}
        </div>

        {/* Desktop/Tablet Grid - 6 rows × 5 products per row (only show available products) */}
        <div className="hidden md:grid grid-cols-3 lg:grid-cols-5 gap-6 mb-12 max-w-7xl mx-auto">
          {nonNullProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* View All Products Button */}
        <div className="text-center">
          <Button asChild variant="outline" size="lg" className="px-8 rounded-full">
            <Link href="/products">View All Products</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
