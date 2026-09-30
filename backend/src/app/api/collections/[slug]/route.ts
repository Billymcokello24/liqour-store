import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const collection = await query(
      `SELECT id, name, slug, description, image_url, seo_title, seo_description
       FROM collections WHERE slug = $1 AND status = 'active'`,
      [slug],
    );
    const found = collection.rows[0];
    if (!found) return NextResponse.json({ error: "Collection not found." }, { status: 404 });

    const products = await query(
      `SELECT p.id, p.name, p.slug, b.name AS brand, c.name AS category, p.new_arrival,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', v.id, 'sku', v.sku, 'volumeMl', v.volume_ml, 'priceKes', v.price_kes,
             'compareAtPriceKes', v.compare_at_price_kes, 'stock', v.stock_on_hand
           ) ORDER BY v.price_kes)
           FROM product_variants v WHERE v.product_id = p.id AND v.is_active
         ), '[]'::json) AS variants,
         COALESCE((
           SELECT m.public_url FROM product_images pi JOIN media_assets m ON m.id = pi.media_id
           WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1
         ), c.image_url) AS primary_image
       FROM collection_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE ci.collection_id = $1 AND p.status = 'active' AND p.deleted_at IS NULL
       ORDER BY ci.sort_order, p.name`,
      [found.id],
    );
    return NextResponse.json({ collection: found, products: products.rows });
  } catch (error) {
    return apiError(error);
  }
}
