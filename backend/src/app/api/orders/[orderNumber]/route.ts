import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const editInput = z.object({
  phone: z.string().trim().min(8).max(32).optional(),
  address: z.string().trim().min(3).max(240).optional(),
  area: z.string().trim().min(2).max(120).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: "Provide at least one field to update.",
});

const EDITABLE_STATUSES = ["pending_payment", "payment_confirmed", "confirmed", "preparing", "ready"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const session = await requireSession(request, ["customer"]);
    const { orderNumber } = await context.params;
    const input = editInput.parse(await request.json());
    const found = await query<{
      id: string;
      order_number: string;
      status: string;
      delivery_address: Record<string, unknown> | null;
      customer_note: string | null;
    }>(
      `SELECT id, order_number, status, delivery_address, customer_note
       FROM orders WHERE order_number = $1 AND customer_id = $2`,
      [orderNumber, session.userId],
    );
    const order = found.rows[0];
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (!EDITABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: "This order is already being dispatched and can no longer be changed. Contact support if you need help." },
        { status: 422 },
      );
    }
    const address = { ...(order.delivery_address ?? {}) };
    if (input.phone !== undefined) address.phone = input.phone;
    if (input.address !== undefined) address.address = input.address;
    if (input.area !== undefined) address.area = input.area;
    const note = input.notes === undefined ? order.customer_note : input.notes;
    await query(
      `UPDATE orders SET delivery_address = $1, customer_note = $2, updated_at = now()
       WHERE id = $3`,
      [JSON.stringify(address), note, order.id],
    );
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'order.customer_edited', 'order', $2, $3)`,
      [session.userId, order.id, JSON.stringify({ phone: input.phone, address: input.address, area: input.area })],
    );
    return NextResponse.json({
      order: { order_number: order.order_number, delivery_address: address, customer_note: note },
    });
  } catch (error) {
    return apiError(error);
  }
}
