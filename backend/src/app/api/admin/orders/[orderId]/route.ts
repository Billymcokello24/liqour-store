import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const statusInput = z.object({
  status: z.enum(["confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"]),
});

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
       SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, status, customer_id, order_number, total_kes`,
      [input.status, orderId],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const order = result.rows[0];
    const customerMessages: Record<string, string> = {
      confirmed: "Your order has been confirmed and is being prepared.",
      preparing: "Your order is being prepared for dispatch.",
      out_for_delivery: "Your order is out for delivery and will arrive shortly.",
      delivered: "Your order has been delivered. Enjoy!",
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
