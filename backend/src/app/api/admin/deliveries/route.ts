import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager"]);
    // Deliveries are tracked through orders with out_for_delivery status
    const result = await query(
      `SELECT o.id, o.order_number, o.status, o.delivery_address, o.total_kes,
              o.placed_at, concat(u.first_name, ' ', u.last_name) AS customer_name,
              u.phone AS customer_phone
       FROM orders o JOIN users u ON u.id = o.customer_id
       WHERE o.status IN ('confirmed', 'preparing', 'out_for_delivery')
       ORDER BY o.placed_at DESC LIMIT 100`,
    );
    return NextResponse.json({ deliveries: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
