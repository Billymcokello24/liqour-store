import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { apiError } from "@/lib/http";

const deliverInput = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), delivering: z.boolean() }))
    .min(1)
    .max(100),
});

export async function POST(
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
    const input = deliverInput.parse(await request.json());
    const result = await transaction(async (client) => {
      const found = await client.query<{
        id: string;
        order_number: string;
        customer_id: string | null;
        total_kes: number;
      }>(
        `SELECT id, order_number, customer_id, total_kes FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      const header = found.rows[0];
      if (!header) throw new Response("Order not found.", { status: 404 });

      const itemRows = await client.query<{
        id: string;
        product_snapshot: { name?: string } | null;
      }>(`SELECT id, product_snapshot FROM order_items WHERE order_id = $1`, [
        orderId,
      ]);
      const byId = new Map(itemRows.rows.map((row) => [row.id, row]));

      const delivering: string[] = [];
      const excluded: string[] = [];
      for (const choice of input.items) {
        const item = byId.get(choice.id);
        if (!item)
          throw new Response(
            "One of the selected items does not belong to this order.",
            { status: 422 },
          );
        await client.query(`UPDATE order_items SET fulfilment = $1 WHERE id = $2`, [
          choice.delivering ? "delivering" : "excluded",
          choice.id,
        ]);
        const name = String(item.product_snapshot?.name ?? "An item");
        (choice.delivering ? delivering : excluded).push(name);
      }

      await client.query(
        `UPDATE orders SET status = 'out_for_delivery', updated_at = now() WHERE id = $1`,
        [orderId],
      );

      const lines: string[] = [];
      if (delivering.length)
        lines.push(`Being delivered now: ${delivering.join(", ")}.`);
      if (excluded.length)
        lines.push(
          `Not available for this trip: ${excluded.join(
            ", ",
          )}. Our team will call you to refund or rearrange these.`,
        );
      const message = `Your order ${header.order_number} is out for delivery. ${lines.join(" ")}`.trim();

      if (header.customer_id) {
        await client.query(
          `INSERT INTO notification_log (user_id, channel, template_key, payload)
           VALUES ($1, 'in_app', 'order-delivery-update', $2)`,
          [
            header.customer_id,
            JSON.stringify({
              orderNumber: header.order_number,
              totalKes: header.total_kes,
              status: "out_for_delivery",
              message,
              delivering,
              excluded,
            }),
          ],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'order.dispatched', 'order', $2, $3)`,
        [
          session.userId,
          orderId,
          JSON.stringify({ delivering, excluded }),
        ],
      );
      return {
        order: { ...header, status: "out_for_delivery" },
        delivering,
        excluded,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
