import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const ADMIN_ROLES = ["super_admin", "manager"] as const;

const couponInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(3).max(64).regex(/^[A-Z0-9_-]+$/i, "Coupon codes may only contain letters, numbers, dashes and underscores."),
  discountType: z.enum(["percentage", "fixed", "free_delivery"]),
  discountValue: z.number().int().nonnegative().max(1000000),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  minimumOrderKes: z.number().int().nonnegative().default(0),
  usageLimit: z.number().int().positive().nullable().optional(),
  status: z.enum(["draft", "active", "disabled", "archived"]).default("draft"),
});

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const result = await query(
      `SELECT c.id, c.code, c.usage_count, c.created_at,
         p.id AS promotion_id, p.name, p.discount_type, p.discount_value,
         p.starts_at, p.ends_at, p.minimum_order_kes, p.usage_limit, p.status
       FROM coupons c JOIN promotions p ON p.id = c.promotion_id
       ORDER BY c.created_at DESC LIMIT 100`,
    );
    return NextResponse.json({ coupons: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const input = couponInput.parse(await request.json());
    if (input.discountType === "percentage" && input.discountValue > 100) {
      return NextResponse.json({ error: "Percentage discounts cannot exceed 100." }, { status: 422 });
    }
    const coupon = await transaction(async (client) => {
      const promotion = await client.query<{ id: string }>(
        `INSERT INTO promotions (name, discount_type, discount_value, starts_at, ends_at, minimum_order_kes, usage_limit, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [input.name, input.discountType, input.discountValue, input.startsAt, input.endsAt, input.minimumOrderKes, input.usageLimit ?? null, input.status],
      );
      const created = await client.query(
        `INSERT INTO coupons (code, promotion_id) VALUES (upper($1), $2)
         ON CONFLICT (code) DO UPDATE SET promotion_id = EXCLUDED.promotion_id
         RETURNING id, code, usage_count`,
        [input.code, promotion.rows[0].id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'coupon.upserted', 'coupon', $2, $3)`,
        [session.userId, created.rows[0].id, JSON.stringify({ code: input.code, name: input.name, discountType: input.discountType })],
      );
      return created.rows[0];
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

const couponPatch = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  discountType: z.enum(["percentage", "fixed", "free_delivery"]).optional(),
  discountValue: z.number().int().nonnegative().max(1000000).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  minimumOrderKes: z.number().int().nonnegative().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  status: z.enum(["draft", "active", "disabled", "archived"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const input = couponPatch.parse(await request.json());
    if (input.discountType === "percentage" && input.discountValue !== undefined && input.discountValue > 100) {
      return NextResponse.json({ error: "Percentage discounts cannot exceed 100." }, { status: 422 });
    }
    const coupon = await transaction(async (client) => {
      const existing = await client.query<{ promotion_id: string; code: string }>(
        `SELECT c.promotion_id, c.code FROM coupons c WHERE c.id = $1 FOR UPDATE`,
        [input.id],
      );
      const found = existing.rows[0];
      if (!found) throw new Response("Coupon not found.", { status: 404 });
      const updated = await client.query(
        `UPDATE promotions p SET
           name = coalesce($2, p.name),
           discount_type = coalesce($3, p.discount_type),
           discount_value = coalesce($4, p.discount_value),
           starts_at = coalesce($5, p.starts_at),
           ends_at = coalesce($6, p.ends_at),
           minimum_order_kes = coalesce($7, p.minimum_order_kes),
           usage_limit = coalesce($8, p.usage_limit),
           status = coalesce($9, p.status)
         WHERE p.id = (SELECT promotion_id FROM coupons WHERE id = $1)
         RETURNING id, name, discount_type, discount_value, starts_at, ends_at, minimum_order_kes, usage_limit, status`,
        [
          input.id,
          input.name ?? null,
          input.discountType ?? null,
          input.discountValue ?? null,
          input.startsAt ? new Date(input.startsAt) : null,
          input.endsAt ? new Date(input.endsAt) : null,
          input.minimumOrderKes ?? null,
          input.usageLimit ?? null,
          input.status ?? null,
        ],
      );
      if (!updated.rows[0]) throw new Response("Coupon not found.", { status: 404 });
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, old_value, new_value)
         VALUES ($1, 'coupon.updated', 'coupon', $2, $3, $4)`,
        [session.userId, found.promotion_id, null, JSON.stringify({ code: found.code, changes: input })],
      );
      return { id: input.id, code: found.code, promotion: updated.rows[0] };
    });
    return NextResponse.json({ coupon });
  } catch (error) {
    return apiError(error);
  }
}
