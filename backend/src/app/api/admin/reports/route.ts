import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager"]);
    const [revenue, topProducts, ordersByDay] = await Promise.all([
      query<{ period: string; revenue: number; orders: number }>(
        `SELECT 'today' AS period,
                COALESCE(sum(total_kes), 0)::int AS revenue,
                count(*)::int AS orders
         FROM orders WHERE date_trunc('day', placed_at) = date_trunc('day', now())
           AND status NOT IN ('cancelled', 'refunded')
         UNION ALL
         SELECT 'this_week',
                COALESCE(sum(total_kes), 0)::int,
                count(*)::int
         FROM orders WHERE placed_at >= date_trunc('week', now())
           AND status NOT IN ('cancelled', 'refunded')
         UNION ALL
         SELECT 'this_month',
                COALESCE(sum(total_kes), 0)::int,
                count(*)::int
         FROM orders WHERE placed_at >= date_trunc('month', now())
           AND status NOT IN ('cancelled', 'refunded')`,
      ),
      query(
        `SELECT p.name, b.name AS brand, sum(oi.quantity)::int AS units_sold,
                sum(oi.unit_price_kes * oi.quantity)::int AS revenue
         FROM order_items oi
         JOIN product_variants pv ON pv.id = oi.product_variant_id
         JOIN products p ON p.id = pv.product_id
         JOIN brands b ON b.id = p.brand_id
         WHERE oi.created_at >= now() - interval '30 days'
         GROUP BY p.name, b.name ORDER BY revenue DESC LIMIT 10`,
      ),
      query(
        `SELECT date_trunc('day', placed_at)::date AS day,
                count(*)::int AS orders,
                COALESCE(sum(total_kes), 0)::int AS revenue
         FROM orders WHERE placed_at >= now() - interval '30 days'
           AND status NOT IN ('cancelled', 'refunded')
         GROUP BY day ORDER BY day`,
      ),
    ]);
    return NextResponse.json({
      summary: revenue.rows,
      topProducts: topProducts.rows,
      ordersByDay: ordersByDay.rows,
    });
  } catch (error) {
    return apiError(error);
  }
}
