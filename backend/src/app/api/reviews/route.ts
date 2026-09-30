import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const reviewInput = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(5).max(2000),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const productId = request.nextUrl.searchParams.get("productId");
    const result = await query(
      `SELECT r.id, r.rating, r.body, r.status, r.is_verified_purchase, r.created_at,
         p.name AS product_name, p.slug AS product_slug, p.id AS product_id
       FROM reviews r JOIN products p ON p.id = r.product_id
       WHERE r.customer_id = $1 ${productId ? "AND r.product_id = $2" : ""}
       ORDER BY r.created_at DESC LIMIT 50`,
      productId ? [session.userId, productId] : [session.userId],
    );
    return NextResponse.json({ reviews: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const input = reviewInput.parse(await request.json());
    const product = await query<{ id: string; name: string }>(
      "SELECT id, name FROM products WHERE id = $1 AND status = 'active' AND deleted_at IS NULL",
      [input.productId],
    );
    if (!product.rows[0]) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const purchase = await query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       JOIN product_variants v ON v.id = oi.product_variant_id
       WHERE o.customer_id = $1 AND v.product_id = $2 AND o.status <> 'cancelled'`,
      [session.userId, input.productId],
    );
    const review = await query(
      `INSERT INTO reviews (product_id, customer_id, rating, body, is_verified_purchase)
       VALUES ($1, $2, $3, $4, $5 > 0)
       ON CONFLICT (product_id, customer_id) DO UPDATE SET
         rating = EXCLUDED.rating, body = EXCLUDED.body,
         is_verified_purchase = EXCLUDED.is_verified_purchase, status = 'draft'
       RETURNING id, status`,
      [input.productId, session.userId, input.rating, input.body, purchase.rows[0].count],
    );
    return NextResponse.json(
      { review: review.rows[0], message: "Thanks! Your review will appear once approved." },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "An review id is required." }, { status: 400 });
    const result = await query(
      "DELETE FROM reviews WHERE id = $1 AND customer_id = $2 RETURNING id",
      [id, session.userId],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    return NextResponse.json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
