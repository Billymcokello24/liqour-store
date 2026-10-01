import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { apiError } from "@/lib/http";

const CANCELLABLE_STATUSES = ["pending_payment", "payment_confirmed", "confirmed", "preparing", "ready"];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const session = await requireSession(request, ["customer"]);
    const { orderNumber } = await context.params;
    const result = await transaction(async (client) => {
      const found = await client.query<{
        id: string;
        order_number: string;
        status: string;
        total_kes: number;
      }>(
        `SELECT id, order_number, status, total_kes FROM orders
         WHERE order_number = $1 AND customer_id = $2 FOR UPDATE`,
        [orderNumber, session.userId],
      );
      const order = found.rows[0];
      if (!order) throw new Response("Order not found.", { status: 404 });
      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        throw new Response(
          "This order is already being dispatched and can no longer be cancelled. Contact support if you need help.",
          { status: 422 },
        );
      }

      const items = await client.query<{ product_variant_id: string; quantity: number }>(
        `SELECT product_variant_id, quantity FROM order_items WHERE order_id = $1`,
        [order.id],
      );
      for (const item of items.rows) {
        if (!item.product_variant_id) continue;
        await client.query(
          `UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = now() WHERE id = $2`,
          [item.quantity, item.product_variant_id],
        );
        await client.query(
          `INSERT INTO inventory_transactions (variant_id, change_quantity, reason, reference_type, reference_id, created_by)
           VALUES ($1, $2, 'order_cancellation_release', 'order', $3, $4)`,
          [item.product_variant_id, item.quantity, order.id, session.userId],
        );
      }

      await client.query(
        `UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [order.id],
      );
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'in_app', 'order-cancelled', $2)`,
        [
          session.userId,
          JSON.stringify({
            orderNumber: order.order_number,
            totalKes: order.total_kes,
            status: "cancelled",
            message: `Your order ${order.order_number} has been cancelled. Any payment already made will be refunded within 3 business days.`,
          }),
        ],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'order.cancelled_by_customer', 'order', $2, $3)`,
        [session.userId, order.id, JSON.stringify({ status: "cancelled" })],
      );
      return { order_number: order.order_number, status: "cancelled" };
    });
    return NextResponse.json({ order: result });
  } catch (error) {
    return apiError(error);
  }
}
