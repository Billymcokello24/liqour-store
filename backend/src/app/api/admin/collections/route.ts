import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const ADMIN_ROLES = ["super_admin", "manager"] as const;

const collectionInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  status: z.enum(["draft", "active", "disabled", "archived"]).default("draft"),
  seoTitle: z.string().trim().max(180).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  productIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const result = await query(
      `SELECT c.id, c.name, c.slug, c.status, c.sort_order, c.updated_at,
         COALESCE((SELECT count(*)::int FROM collection_items ci WHERE ci.collection_id = c.id), 0) AS product_count
       FROM collections c ORDER BY c.sort_order, c.name`,
    );
    return NextResponse.json({ collections: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const input = collectionInput.parse(await request.json());
    const collection = await transaction(async (client) => {
      const saved = await client.query(
        `INSERT INTO collections (name, slug, description, image_url, sort_order, status, seo_title, seo_description, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
           image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, status = EXCLUDED.status,
           seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description, updated_at = now()
         RETURNING id, slug, status`,
        [input.name, input.slug, input.description ?? null, input.imageUrl ?? null, input.sortOrder, input.status, input.seoTitle ?? null, input.seoDescription ?? null],
      );
      const row = saved.rows[0];
      if (input.productIds) {
        await client.query("DELETE FROM collection_items WHERE collection_id = $1", [row.id]);
        for (let index = 0; index < input.productIds.length; index += 1) {
          await client.query(
            `INSERT INTO collection_items (collection_id, product_id, sort_order)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [row.id, input.productIds[index], index],
          );
        }
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'collection.upserted', 'collection', $2, $3)`,
        [session.userId, row.id, JSON.stringify({ slug: input.slug, status: input.status, products: input.productIds?.length ?? null })],
      );
      return row;
    });
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
