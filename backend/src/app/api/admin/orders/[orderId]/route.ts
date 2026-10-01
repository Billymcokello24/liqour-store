import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const statusInput = z.object({
  status: z.enum(["confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"]),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    await requireSession(request, ["super_admin", "manager", "sales", "delivery"]);
    const { orderId } = await context.params;
    const result = await query(
      `SELECT o.id, o.order_number, o.status, o.payment_method, o.payment_status, o.delivery_type,
              o.delivery_address, o.customer_note, o.subtotal_kes, o.discount_kes, o.delivery_fee_kes,
              o.total_kes, o.placed_at, o.updated_at,
              concat(u.first_name, ' ', u.last_name) AS customer_name,
              u.email AS customer_email, u.phone AS customer_phone,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', oi.id,
                  'name', oi.product_snapshot->>'name',
                  'quantity', oi.quantity,
                  'unitPriceKes', oi.unit_price_kes,
                  'image', oi.image_snapshot_url,
                  'fulfilment', oi.fulfilment
                ) ORDER BY oi.created_at)
                FROM order_items oi WHERE oi.order_id = o.id
              ), '[]'::json) AS items
       FROM orders o
       JOIN users u ON u.id = o.customer_id
       WHERE o.id = $1`,
      [orderId],
    );
    const order = result.rows[0];
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const session = await requireSession(request, [
      "super_admin",
      "manager",
      "sales",
      "delivery",
    ]);
    const { orderId } = await context.params;
    const input = statusInput.parse(await request.json());
    const result = await query<{
      id: string;
      status: string;
      customer_id: string | null;
      order_number: string;
      total_kes: number;
    }>(
      `UPDATE orders
       SET status = $1, updated_at = now(),
           payment_status = CASE
             WHEN $1 = 'delivered' AND payment_method = 'cash' THEN 'paid'
             ELSE payment_status
           END
       WHERE id = $2
       RETURNING id, status, customer_id, order_number, total_kes`,
      [input.status, orderId],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = result.rows[0];
    if (input.status === "out_for_delivery") {
      await query(
        `UPDATE order_items SET fulfilment = 'delivering' WHERE order_id = $1 AND fulfilment = 'pending'`,
        [order.id],
      );
    }
    const customerMessages: Record<string, string> = {
      confirmed: "Your order has been confirmed and is being prepared.",
      preparing: "Your order is being prepared for dispatch.",
      out_for_delivery: "Your order is out for delivery and will arrive shortly.",
      delivered: "Your order has been delivered. Your official receipt is ready — open Track your order to view and print a copy.",
      cancelled: "Your order has been cancelled. Contact support if this was unexpected.",
    };
    const message = customerMessages[input.status];
    if (message && order.customer_id) {
      await query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'in_app', $2, $3)`,
        [
          order.customer_id,
          `order-${input.status}`,
          JSON.stringify({ orderNumber: order.order_number, totalKes: order.total_kes, status: input.status, message }),
        ],
      );
    }
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'order.status_updated', 'order', $2, $3)`,
      [session.userId, orderId, JSON.stringify({ status: input.status })],
    );
    return NextResponse.json({ order: result.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}
