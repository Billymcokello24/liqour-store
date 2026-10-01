import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const [orders, bookings, wishlist, notifications] = await Promise.all([
      query(
        `SELECT o.order_number, o.status, o.payment_status, o.payment_method, o.delivery_type, o.delivery_address, o.customer_note, o.total_kes, o.placed_at,
           COALESCE((
             SELECT json_build_object('name', oi.product_snapshot->>'name', 'image', oi.image_snapshot_url)
             FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at LIMIT 1
           ), '{}'::json) AS first_item
         FROM orders o WHERE o.customer_id = $1 ORDER BY o.placed_at DESC LIMIT 5`,
        [session.userId],
      ),
      query(`SELECT booking_number, event_type, event_date, status, location FROM bookings WHERE customer_id = $1 OR email = $2 ORDER BY created_at DESC LIMIT 5`, [session.userId, session.email]),
      query<{ count: number }>("SELECT count(*)::int AS count FROM wishlist_items WHERE user_id = $1", [session.userId]),
      query<{ count: number }>("SELECT count(*)::int AS count FROM notification_log WHERE user_id = $1 AND sent_at IS NOT NULL", [session.userId]),
    ]);
    return NextResponse.json({
      customer: { email: session.email },
      orders: orders.rows,
      bookings: bookings.rows,
      wishlistCount: wishlist.rows[0].count,
      notificationCount: notifications.rows[0].count,
    });
  } catch (error) {
    return apiError(error);
  }
}
