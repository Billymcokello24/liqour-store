import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const result = await query(
      `SELECT p.id, p.category_id, p.name, p.slug, p.description, p.short_description, p.country_of_origin,
         p.alcohol_percentage, p.serving_suggestion, p.featured, p.new_arrival, p.best_seller, p.created_at,
         b.name AS brand, b.slug AS brand_slug, b.description AS brand_description,
         c.name AS category, c.slug AS category_slug,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', v.id, 'sku', v.sku, 'barcode', v.barcode, 'volumeMl', v.volume_ml,
             'priceKes', v.price_kes, 'compareAtPriceKes', v.compare_at_price_kes,
             'stock', v.stock_on_hand - v.reserved_stock, 'lowStock', v.stock_on_hand - v.reserved_stock <= v.reorder_level
           ) ORDER BY v.price_kes)
           FROM product_variants v WHERE v.product_id = p.id AND v.is_active
         ), '[]'::json) AS variants,
         COALESCE((
           SELECT json_agg(json_build_object('url', m.public_url, 'alt', m.alt_text, 'isPrimary', pi.is_primary)
             ORDER BY pi.is_primary DESC, pi.sort_order)
           FROM product_images pi JOIN media_assets m ON m.id = pi.media_id
           WHERE pi.product_id = p.id
         ), '[]'::json) AS images,
         COALESCE((SELECT round(avg(rating), 1)::numeric FROM reviews r WHERE r.product_id = p.id AND r.status = 'active'), 0) AS rating,
         COALESCE((SELECT count(*)::int FROM reviews r WHERE r.product_id = p.id AND r.status = 'active'), 0) AS review_count
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE (p.slug = $1 OR p.id::text = $1) AND p.status = 'active' AND p.deleted_at IS NULL`,
      [slug],
    );
    const product = result.rows[0];
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const [reviews, related] = await Promise.all([
      query(
        `SELECT r.id, r.rating, r.body, r.is_verified_purchase, r.created_at,
           CASE WHEN u.first_name IS NOT NULL THEN u.first_name ELSE 'Customer' END AS author
         FROM reviews r JOIN users u ON u.id = r.customer_id
         WHERE r.product_id = $1 AND r.status = 'active'
         ORDER BY r.created_at DESC LIMIT 12`,
        [product.id],
      ),
      query(
        `SELECT p.id, p.name, p.slug, b.name AS brand, c.name AS category,
           COALESCE((
             SELECT json_agg(json_build_object('id', v.id, 'volumeMl', v.volume_ml, 'priceKes', v.price_kes,
               'compareAtPriceKes', v.compare_at_price_kes, 'stock', v.stock_on_hand) ORDER BY v.price_kes)
             FROM product_variants v WHERE v.product_id = p.id AND v.is_active), '[]'::json) AS variants,
           COALESCE((
             SELECT m.public_url FROM product_images pi JOIN media_assets m ON m.id = pi.media_id
             WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1), c.image_url) AS primary_image
         FROM products p JOIN brands b ON b.id = p.brand_id JOIN categories c ON c.id = p.category_id
         WHERE c.id = $1 AND p.status = 'active' AND p.deleted_at IS NULL AND p.id <> $2
         ORDER BY p.featured DESC, p.created_at DESC LIMIT 8`,
        [product.category_id, product.id],
      ),
    ]);
    return NextResponse.json({ product, reviews: reviews.rows, related: related.rows });
  } catch (error) {
    return apiError(error);
  }
}
