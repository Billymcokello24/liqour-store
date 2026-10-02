import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";

const updateInput = z
  .object({
    name: z.string().trim().min(2).max(180).optional(),
    description: z.string().trim().max(8000).optional(),
    shortDescription: z.string().trim().max(300).optional(),
    countryOfOrigin: z.string().trim().max(120).optional(),
    alcoholPercentage: z.number().min(0).max(100).nullable().optional(),
    servingSuggestion: z.string().trim().max(500).optional(),
    brandId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(["active", "draft", "disabled"]).optional(),
    imageAssetId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
    volumeMl: z.number().int().positive().optional(),
    sku: z.string().trim().min(2).max(80).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined));

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const session = await requireSession(request, [
      "super_admin",
      "manager",
      "sales",
    ]);
    const { productId } = await context.params;
    const input = updateInput.parse(await request.json());

    const product = await transaction(async (client) => {
      const result = await client.query<{ id: string; name: string; status: string }>(
        `UPDATE products
         SET name = COALESCE($1, name), description = COALESCE($2, description),
             status = COALESCE($3, status),
             short_description = COALESCE($4, short_description),
             country_of_origin = COALESCE($5, country_of_origin),
             alcohol_percentage = COALESCE($6, alcohol_percentage),
             serving_suggestion = COALESCE($7, serving_suggestion),
             brand_id = COALESCE($8, brand_id),
             category_id = COALESCE($9, category_id),
             updated_at = now()
         WHERE id = $10 AND deleted_at IS NULL
         RETURNING id, name, status,
                   EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id) AS has_images`,
        [
          input.name ?? null,
          input.description ?? null,
          input.status ?? null,
          input.shortDescription ?? null,
          input.countryOfOrigin ?? null,
          input.alcoholPercentage ?? null,
          input.servingSuggestion ?? null,
          input.brandId ?? null,
          input.categoryId ?? null,
          productId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Product not found.");

      if (input.variantId && (input.volumeMl !== undefined || input.sku !== undefined)) {
        const variant = await client.query(
          `UPDATE product_variants
           SET volume_ml = COALESCE($2, volume_ml), sku = COALESCE($3, sku), updated_at = now()
           WHERE id = $1 AND product_id = $4
           RETURNING id`,
          [input.variantId, input.volumeMl ?? null, input.sku ?? null, productId],
        );
        if (!variant.rows[0]) throw new Error("The selected size could not be found.");
      }

      let primaryImage: string | null = null;
      if (input.imageAssetId) {
        const asset = await client.query(
          `SELECT 1 FROM media_assets WHERE id = $1`,
          [input.imageAssetId],
        );
        if (!asset.rows[0]) throw new Error("The selected image could not be found.");
        await client.query(
          `UPDATE product_images SET is_primary = false WHERE product_id = $1`,
          [productId],
        );
        await client.query(
          `INSERT INTO product_images (product_id, media_id, sort_order, is_primary)
           SELECT $1, m.id, 0, true FROM media_assets m WHERE m.id = $2
           ON CONFLICT (product_id, media_id) DO UPDATE SET is_primary = true, sort_order = 0`,
          [productId, input.imageAssetId],
        );
        const url = await client.query<{ public_url: string }>(
          `SELECT m.public_url FROM product_images pi
           JOIN media_assets m ON m.id = pi.media_id
           WHERE pi.product_id = $1 AND pi.is_primary`,
          [productId],
        );
        primaryImage = url.rows[0]?.public_url ?? null;
      } else {
        const url = await client.query<{ public_url: string }>(
          `SELECT m.public_url FROM product_images pi
           JOIN media_assets m ON m.id = pi.media_id
           WHERE pi.product_id = $1
           ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1`,
          [productId],
        );
        primaryImage = url.rows[0]?.public_url ?? null;
      }

      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'product.updated', 'product', $2, $3)`,
        [
          session.userId,
          productId,
          JSON.stringify({
            name: input.name ?? null,
            status: input.status ?? null,
            imageChanged: Boolean(input.imageAssetId),
          }),
        ],
      );
      return { ...row, primaryImage };
    });

    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof Error && error.message === "Product not found.") {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const detail = String((error as { message?: string }).message ?? "");
    if (detail.includes("product_variants_sku_key")) {
      return NextResponse.json({ error: "That SKU is already assigned to another bottle — SKUs must be unique." }, { status: 409 });
    }
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const session = await requireSession(request, ["super_admin", "manager"]);
    const { productId } = await context.params;
    const result = await query<{ id: string }>(
      `UPDATE products SET status = 'disabled', deleted_at = now(), updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [productId],
    );
    if (!result.rows[0])
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'product.deleted', 'product', $2, $3)`,
      [session.userId, productId, JSON.stringify({ softDeleted: true })],
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
