import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { productInput } from "@/lib/validation";
import { slugify, uniqueSlug, resolveSku, SkuTakenError } from "@/lib/products";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("q")?.trim() ?? "";
    const category = searchParams.get("category");
    const brand = searchParams.get("brand");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(48, Math.max(1, Number(searchParams.get("limit") ?? 24)));
    const result = await query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.new_arrival, b.name AS brand, c.name AS category,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', v.id,
             'sku', v.sku,
             'volumeMl', v.volume_ml,
             'priceKes', v.price_kes,
             'compareAtPriceKes', v.compare_at_price_kes,
             'stock', v.stock_on_hand
           ) ORDER BY v.price_kes)
           FROM product_variants v
           WHERE v.product_id = p.id AND v.is_active
         ), '[]'::json) AS variants,
         COALESCE((
           SELECT m.public_url
           FROM product_images pi
           JOIN media_assets m ON m.id = pi.media_id
           WHERE pi.product_id = p.id
           ORDER BY pi.is_primary DESC, pi.sort_order ASC
           LIMIT 1
         ), c.image_url) AS primary_image
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active' AND p.deleted_at IS NULL
         AND ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR b.name ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR c.slug = $2)
         AND ($3::text IS NULL OR b.slug = $3)
       ORDER BY p.featured DESC, p.created_at DESC
       LIMIT $4 OFFSET $5`,
      [search, category, brand, limit, (page - 1) * limit],
    );
    return NextResponse.json({ products: result.rows, page, limit });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["super_admin", "manager", "sales"]);
    const input = productInput.parse(await request.json());
    const product = await transaction(async (client) => {
      const baseSlug = input.slug?.trim() || slugify(input.name);
      const slug = await uniqueSlug(client, baseSlug);
      const productResult = await client.query<{ id: string }>(
        `INSERT INTO products (name, slug, brand_id, category_id, description, short_description,
            country_of_origin, alcohol_percentage, serving_suggestion, status, featured)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          input.name,
          slug,
          input.brandId,
          input.categoryId,
          input.description ?? null,
          input.shortDescription ?? null,
          input.countryOfOrigin ?? null,
          input.alcoholPercentage ?? null,
          input.servingSuggestion ?? null,
          input.status,
          input.featured,
        ],
      );
      const productId = productResult.rows[0].id;
      if (input.imageAssetId) {
        const linked = await client.query(
          `INSERT INTO product_images (product_id, media_id, sort_order, is_primary)
           SELECT $1, m.id, 0, true FROM media_assets m WHERE m.id = $2
           ON CONFLICT DO NOTHING`,
          [productId, input.imageAssetId],
        );
        if (linked.rowCount === 0) throw new Error("selected-image-missing");
      }
      const variantSkus: string[] = [];
      for (const variant of input.variants) {
        const sku = await resolveSku(client, variant.sku);
        await client.query(
          `INSERT INTO product_variants (product_id, sku, barcode, volume_ml, price_kes, compare_at_price_kes, stock_on_hand)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [productId, sku, variant.barcode ?? null, variant.volumeMl, variant.price, variant.compareAtPrice ?? null, variant.stock],
        );
        variantSkus.push(sku);
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'product.created', 'product', $2, $3)`,
        [session.userId, productId, JSON.stringify({ name: input.name, status: input.status })],
      );
      return { id: productId, slug, skus: variantSkus };
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof SkuTakenError) {
      return NextResponse.json({ error: `SKU "${error.sku}" is already assigned to another bottle. Use a unique SKU or leave it blank to auto-generate.` }, { status: 409 });
    }
    return apiError(error);
  }
}
