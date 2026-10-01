import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { orderInput } from "@/lib/validation";
import { emailShell, esc, sendLoggedEmail } from "@/lib/mailer";

const PAYMENT_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  card: "Card",
  bank: "Bank transfer",
  cash: "Pay on delivery (M-Pesa or cash at the door)",
};

type VariantRow = { id: string; sku: string; price_kes: number; stock_on_hand: number; reserved_stock: number; name: string; slug: string; brand: string; volume_ml: number };

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const result = await query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method, o.delivery_type,
         o.subtotal_kes, o.discount_kes, o.delivery_fee_kes, o.total_kes, o.placed_at, o.updated_at,
         (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         COALESCE((
           SELECT json_build_object('name', oi.product_snapshot->>'name', 'image', oi.image_snapshot_url)
           FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at LIMIT 1
         ), '{}'::json) AS first_item
       FROM orders o WHERE o.customer_id = $1 ORDER BY o.placed_at DESC LIMIT 100`,
      [session.userId],
    );
    return NextResponse.json({ orders: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["customer"]);
    const input = orderInput.parse(await request.json());
    if (input.deliveryType === "delivery" && !input.deliveryAddress) {
      return NextResponse.json({ error: "A delivery address is required." }, { status: 422 });
    }
    const order = await transaction(async (client) => {
      const ids = input.items.map((item) => item.variantId);
      const result = await client.query<VariantRow>(
        `SELECT v.id, v.sku, v.price_kes, v.stock_on_hand, v.reserved_stock, v.volume_ml, p.name, p.slug, b.name AS brand
         FROM product_variants v JOIN products p ON p.id = v.product_id JOIN brands b ON b.id = p.brand_id
         WHERE v.id = ANY($1::uuid[]) AND v.is_active AND p.status = 'active' AND p.deleted_at IS NULL
         FOR UPDATE`,
        [ids],
      );
      if (result.rows.length !== input.items.length) throw new Response("One or more products are unavailable.", { status: 422 });
      const lines = input.items.map((item) => {
        const variant = result.rows.find((row) => row.id === item.variantId)!;
        if (variant.stock_on_hand - variant.reserved_stock < item.quantity) throw new Response(`${variant.name} does not have enough stock.`, { status: 422 });
        return { variant, quantity: item.quantity, lineTotal: variant.price_kes * item.quantity };
      });
      const subtotal = lines.reduce((total, line) => total + line.lineTotal, 0);
      const deliverySetting = await client.query<{ value: { feeKes?: number; freeAboveKes?: number } }>(
        "SELECT value FROM settings WHERE key = 'delivery'",
      );
      const deliveryConfig = deliverySetting.rows[0]?.value ?? {};
      const freeAbove = Number(deliveryConfig.freeAboveKes ?? 5000);
      let deliveryFee = input.deliveryType === "pickup" || subtotal >= freeAbove ? 0 : Number(deliveryConfig.feeKes ?? 300);
      let discount = 0;
      let coupon: { id: string; code: string } | null = null;
      if (input.couponCode) {
        const couponResult = await client.query<{ id: string; code: string; discount_type: string; discount_value: number; minimum_order_kes: number; usage_limit: number | null; usage_count: number }>(
          `SELECT c.id, c.code, p.discount_type, p.discount_value, p.minimum_order_kes, p.usage_limit, c.usage_count
           FROM coupons c JOIN promotions p ON p.id = c.promotion_id
           WHERE lower(c.code) = lower($1) AND p.status = 'active'
             AND now() >= p.starts_at AND now() <= p.ends_at
           FOR UPDATE OF c`,
          [input.couponCode],
        );
        const found = couponResult.rows[0];
        if (!found) throw new Response("That coupon is invalid or has expired.", { status: 422 });
        if (found.usage_limit !== null && found.usage_count >= found.usage_limit) {
          throw new Response("That coupon has reached its usage limit.", { status: 422 });
        }
        if (subtotal < found.minimum_order_kes) {
          throw new Response(`This coupon requires a minimum order of KES ${found.minimum_order_kes.toLocaleString("en-KE")}.`, { status: 422 });
        }
        if (found.discount_type === "percentage") discount = Math.floor((subtotal * found.discount_value) / 100);
        else if (found.discount_type === "fixed") discount = Math.min(found.discount_value, subtotal);
        else if (found.discount_type === "free_delivery") deliveryFee = 0;
        coupon = { id: found.id, code: found.code };
      }
      const created = await client.query<{ id: string; order_number: string }>(
        `INSERT INTO orders (order_number, customer_id, payment_method, delivery_type, delivery_address, subtotal_kes, discount_kes, delivery_fee_kes, total_kes, customer_note)
         VALUES ('HLH-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, order_number`,
        [session.userId, input.paymentMethod, input.deliveryType, input.deliveryAddress ? JSON.stringify(input.deliveryAddress) : null, subtotal, discount, deliveryFee, subtotal - discount + deliveryFee, input.customerNote ?? null],
      );
      if (coupon) {
        await client.query(`UPDATE coupons SET usage_count = usage_count + 1 WHERE id = $1`, [coupon.id]);
        await client.query(
          `INSERT INTO coupon_redemptions (coupon_id, order_id, user_id) VALUES ($1, $2, $3)`,
          [coupon.id, created.rows[0].id, session.userId],
        );
      }
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'in_app', 'order-created', $2)`,
        [session.userId, JSON.stringify({ orderNumber: created.rows[0].order_number, totalKes: subtotal - discount + deliveryFee, message: "We have received your order and are preparing it now." })],
      );
      const buyer = await client.query<{ first_name: string; last_name: string; email: string }>(
        "SELECT first_name, last_name, email FROM users WHERE id = $1",
        [session.userId],
      );
      const staff = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE role IN ('super_admin', 'manager', 'sales') AND is_active",
      );
      const address = (input.deliveryAddress ?? {}) as { address?: string; area?: string };
      for (const staffRow of staff.rows) {
        await client.query(
          `INSERT INTO notification_log (user_id, channel, template_key, payload)
           VALUES ($1, 'order_alert', 'order-received', $2)`,
          [
            staffRow.id,
            JSON.stringify({
              orderId: created.rows[0].id,
              orderNumber: created.rows[0].order_number,
              totalKes: subtotal - discount + deliveryFee,
              customerName: `${buyer.rows[0]?.first_name ?? ""} ${buyer.rows[0]?.last_name ?? ""}`.trim() || "Customer",
              items: lines.map((line) => ({ name: line.variant.name, quantity: line.quantity, priceKes: line.variant.price_kes })),
              location: input.deliveryType === "pickup" ? "Store pickup" : [address.address, address.area].filter(Boolean).join(", ") || "—",
              placedAt: new Date().toISOString(),
            }),
          ],
        );
      }
      for (const line of lines) {
        await client.query(`UPDATE product_variants SET reserved_stock = reserved_stock + $1, updated_at = now() WHERE id = $2`, [line.quantity, line.variant.id]);
        await client.query(
          `INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price_kes, product_snapshot)
           VALUES ($1, $2, $3, $4, $5)`,
          [created.rows[0].id, line.variant.id, line.quantity, line.variant.price_kes, JSON.stringify({ name: line.variant.name, slug: line.variant.slug, brand: line.variant.brand, sku: line.variant.sku, volumeMl: line.variant.volume_ml })],
        );
        await client.query(`INSERT INTO inventory_transactions (variant_id, change_quantity, reason, reference_type, reference_id, created_by) VALUES ($1, $2, 'order_reservation', 'order', $3, $4)`, [line.variant.id, -line.quantity, created.rows[0].id, session.userId]);
      }
      return {
        ...created.rows[0],
        subtotalKes: subtotal,
        discountKes: discount,
        deliveryFeeKes: deliveryFee,
        totalKes: subtotal - discount + deliveryFee,
        customerName: `${buyer.rows[0]?.first_name ?? ""} ${buyer.rows[0]?.last_name ?? ""}`.trim() || "Customer",
        customerEmail: buyer.rows[0]?.email ?? null,
        items: lines.map((line) => ({ name: line.variant.name, quantity: line.quantity, priceKes: line.variant.price_kes })),
        addressLine: [address.address, address.area].filter(Boolean).join(", "),
      };
    });
    if (order.customerEmail) {
      const money = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
      await sendLoggedEmail({
        userId: session.userId,
        templateKey: "order-confirmation",
        payload: { orderNumber: order.order_number, totalKes: order.totalKes },
        to: order.customerEmail,
        subject: `Order ${order.order_number} confirmed`,
        html: emailShell(
          "Thank you — your order is confirmed",
          `<p>Hi ${esc(order.customerName)}, we have received order <strong>${esc(order.order_number)}</strong>.</p>` +
            `<ul style="padding-left:18px;margin:14px 0">${order.items.map((line) => `<li>${esc(line.name)} × ${line.quantity} — ${money(line.priceKes * line.quantity)}</li>`).join("")}</ul>` +
            `<p><strong>Total: ${money(order.totalKes)}</strong> (delivery ${order.deliveryFeeKes === 0 ? "free" : money(order.deliveryFeeKes)})</p>` +
            `<p>Payment: ${esc(PAYMENT_LABELS[input.paymentMethod] ?? input.paymentMethod)}</p>` +
            (order.addressLine ? `<p>Delivering to: ${esc(order.addressLine)}</p>` : "") +
            `<p>Follow this order from your account — our team will call you before the rider leaves.</p>`,
        ),
      });
    }
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
