import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager", "sales", "inventory"]);
    const [revenue, orders, inventory, bookings, recentOrders] = await Promise.all([
      query<{ month_revenue: number; today_revenue: number }>(
        `SELECT COALESCE(sum(total_kes) FILTER (WHERE placed_at >= date_trunc('month', now())), 0)::int AS month_revenue,
                COALESCE(sum(total_kes) FILTER (WHERE placed_at >= date_trunc('day', now())), 0)::int AS today_revenue
           FROM orders WHERE status NOT IN ('cancelled', 'refunded')`,
      ),
      query<{ total: number; pending: number; completed: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status IN ('pending_payment', 'payment_confirmed', 'confirmed', 'preparing'))::int AS pending,
                count(*) FILTER (WHERE status = 'delivered')::int AS completed FROM orders`,
      ),
      query<{ low_stock: number; out_of_stock: number }>(
        `SELECT count(*) FILTER (WHERE stock_on_hand <= reorder_level AND stock_on_hand > 0)::int AS low_stock,
                count(*) FILTER (WHERE stock_on_hand = 0)::int AS out_of_stock FROM product_variants WHERE is_active`,
      ),
      query<{ open_bookings: number }>("SELECT count(*) FILTER (WHERE status NOT IN ('completed', 'cancelled'))::int AS open_bookings FROM bookings"),
      query(
        `SELECT order_number, status, total_kes, payment_method, payment_status, placed_at,
                concat(u.first_name, ' ', u.last_name) AS customer_name
           FROM orders o JOIN users u ON u.id = o.customer_id
          ORDER BY placed_at DESC LIMIT 8`,
      ),
    ]);
    return NextResponse.json({
      revenue: revenue.rows[0],
      orders: orders.rows[0],
      inventory: inventory.rows[0],
      bookings: bookings.rows[0],
      recentOrders: recentOrders.rows,
    });
  } catch (error) {
    return apiError(error);
  }
}
