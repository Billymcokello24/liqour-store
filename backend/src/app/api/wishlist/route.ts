import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const result = await query(
      `SELECT p.id, p.name, p.slug, b.name AS brand, c.name AS category,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', v.id, 'sku', v.sku, 'volumeMl', v.volume_ml,
             'priceKes', v.price_kes, 'compareAtPriceKes', v.compare_at_price_kes,
             'stock', v.stock_on_hand
           ) ORDER BY v.price_kes)
           FROM product_variants v WHERE v.product_id = p.id AND v.is_active
         ), '[]'::json) AS variants,
         COALESCE((
           SELECT m.public_url FROM product_images pi JOIN media_assets m ON m.id = pi.media_id
           WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1
         ), c.image_url) AS primary_image,
         w.created_at AS added_at
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE w.user_id = $1 AND p.status = 'active' AND p.deleted_at IS NULL
       ORDER BY w.created_at DESC`,
      [session.userId],
    );
    return NextResponse.json({ items: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const { productId } = z.object({ productId: z.string().uuid() }).parse(await request.json());
    const product = await query<{ id: string }>(
      "SELECT id FROM products WHERE id = $1 AND status = 'active' AND deleted_at IS NULL",
      [productId],
    );
    if (!product.rows[0]) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    await query(
      `INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [session.userId, productId],
    );
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const productId = request.nextUrl.searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "A productId is required." }, { status: 400 });
    await query("DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2", [session.userId, productId]);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
