import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const ORDER_FLOW = ["pending_payment", "payment_confirmed", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];
const STAFF_ROLES = ["super_admin", "manager", "sales", "inventory", "delivery", "support"];

export async function GET(request: NextRequest) {
  try {
    const session = await readSession(request);
    const isStaff = Boolean(session && STAFF_ROLES.includes(session.role));
    const orderNumber = request.nextUrl.searchParams.get("orderNumber")?.trim();
    const contact = request.nextUrl.searchParams.get("contact")?.trim().toLowerCase();
    if (!orderNumber || (!contact && !isStaff)) {
      return NextResponse.json({ error: "An order number and the email or phone used on the order are required." }, { status: 400 });
    }
    const result = isStaff
      ? await query(
          `SELECT o.order_number, o.status, o.payment_status, o.payment_method, o.delivery_type,
             o.subtotal_kes, o.discount_kes, o.delivery_fee_kes,
             o.total_kes, o.placed_at, o.updated_at, o.delivery_address,
             concat(u.first_name, ' ', u.last_name) AS customer_name,
             (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
             (SELECT coalesce(json_agg(json_build_object(
                'name', oi.product_snapshot->>'name', 'quantity', oi.quantity,
                'unitPriceKes', oi.unit_price_kes, 'image', oi.image_snapshot_url,
                'fulfilment', oi.fulfilment)), '[]'::json)
              FROM order_items oi WHERE oi.order_id = o.id) AS items
           FROM orders o JOIN users u ON u.id = o.customer_id
           WHERE o.order_number = $1`,
          [orderNumber],
        )
      : await query(
          `SELECT o.order_number, o.status, o.payment_status, o.payment_method, o.delivery_type,
             o.subtotal_kes, o.discount_kes, o.delivery_fee_kes,
             o.total_kes, o.placed_at, o.updated_at, o.delivery_address,
             concat(u.first_name, ' ', u.last_name) AS customer_name,
             (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
             (SELECT coalesce(json_agg(json_build_object(
                'name', oi.product_snapshot->>'name', 'quantity', oi.quantity,
                'unitPriceKes', oi.unit_price_kes, 'image', oi.image_snapshot_url,
                'fulfilment', oi.fulfilment)), '[]'::json)
              FROM order_items oi WHERE oi.order_id = o.id) AS items
           FROM orders o
           JOIN users u ON u.id = o.customer_id
           WHERE o.order_number = $1 AND (lower(u.email) = $2 OR replace(u.phone, ' ', '') = replace($2, ' ', ''))`,
          [orderNumber, contact],
        );
    const order = result.rows[0];
    if (!order) return NextResponse.json({ error: "No order matched those details." }, { status: 404 });
    const currentStep = ORDER_FLOW.indexOf(order.status);
    const timeline = ORDER_FLOW.map((step, index) => ({
      step,
      reached: order.status === "cancelled" || order.status === "refunded" ? false : index <= currentStep,
    }));
    return NextResponse.json({ order, timeline });
  } catch (error) {
    return apiError(error);
  }
}
