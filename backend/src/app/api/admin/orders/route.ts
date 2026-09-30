import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager", "sales", "delivery"]);
    const result = await query(
      `SELECT o.id, o.order_number, o.status, o.payment_method, o.delivery_address,
              o.subtotal_kes, o.delivery_fee_kes, o.total_kes, o.placed_at,
              concat(u.first_name, ' ', u.last_name) AS customer_name,
              u.email AS customer_email, u.phone AS customer_phone
       FROM orders o
       JOIN users u ON u.id = o.customer_id
       ORDER BY o.placed_at DESC
       LIMIT 100`,
    );
    return NextResponse.json({ orders: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
