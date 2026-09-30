import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager", "sales", "inventory"]);
    const result = await query(
      `SELECT p.id, p.name, p.slug, p.status, p.description, p.short_description,
              p.country_of_origin, p.alcohol_percentage, p.serving_suggestion,
              p.brand_id, p.category_id,
              b.name AS brand, c.name AS category, p.created_at,
              (SELECT m.public_url
               FROM product_images pi
               JOIN media_assets m ON m.id = pi.media_id
               WHERE pi.product_id = p.id
               ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS primary_image,
              (SELECT json_agg(json_build_object(
                'id', pv.id, 'sku', pv.sku, 'volumeMl', pv.volume_ml,
                'priceKes', pv.price_kes, 'compareAtPriceKes', pv.compare_at_price_kes,
                'stock', pv.stock_on_hand, 'reserved', pv.reserved_stock, 'reorderLevel', pv.reorder_level
              ) ORDER BY pv.price_kes)
               FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active) AS variants
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT 200`,
    );
    return NextResponse.json({ products: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
