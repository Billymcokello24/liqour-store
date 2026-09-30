import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const ADMIN_ROLES = ["super_admin", "manager", "support"] as const;

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const status = request.nextUrl.searchParams.get("status");
    const result = await query(
      `SELECT r.id, r.rating, r.body, r.status, r.is_verified_purchase, r.created_at,
         p.name AS product_name, p.slug AS product_slug,
         u.email AS customer_email, u.first_name, u.last_name
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       JOIN users u ON u.id = r.customer_id
       ${status && status !== "all" ? "WHERE r.status = $1" : ""}
       ORDER BY r.created_at DESC LIMIT 100`,
      status && status !== "all" ? [status] : [],
    );
    return NextResponse.json({ reviews: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const input = z
      .object({ id: z.string().uuid(), status: z.enum(["active", "disabled", "archived"]) })
      .parse(await request.json());
    const previous = await query<{ product_id: string; status: string }>(
      "SELECT product_id, status FROM reviews WHERE id = $1",
      [input.id],
    );
    if (!previous.rows[0]) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    const updated = await query(
      "UPDATE reviews SET status = $1 WHERE id = $2 RETURNING id, status",
      [input.status, input.id],
    );
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, old_value, new_value)
       VALUES ($1, 'review.moderated', 'review', $2, $3, $4)`,
      [session.userId, input.id, JSON.stringify({ status: previous.rows[0].status }), JSON.stringify({ status: input.status })],
    );
    return NextResponse.json({ review: updated.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}
