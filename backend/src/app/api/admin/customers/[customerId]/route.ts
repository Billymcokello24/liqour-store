import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ customerId: string }> },
) {
  try {
    await requireSession(request, [
      "super_admin",
      "manager",
      "sales",
      "support",
      "delivery",
    ]);
    const { customerId } = await context.params;
    const [profile, orders, addresses] = await Promise.all([
      query(
        `SELECT id, email, first_name, last_name, phone, is_active AS status, created_at
         FROM users WHERE id = $1 AND role = 'customer'`,
        [customerId],
      ),
      query(
        `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_kes, o.placed_at
         FROM orders o WHERE o.customer_id = $1
         ORDER BY o.placed_at DESC LIMIT 20`,
        [customerId],
      ),
      query(
        `SELECT id, label, recipient_name, phone, address_line_1, address_line_2, is_default
         FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC`,
        [customerId],
      ),
    ]);
    if (!profile.rows[0])
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({
      customer: profile.rows[0],
      orders: orders.rows,
      addresses: addresses.rows,
    });
  } catch (error) {
    return apiError(error);
  }
}
