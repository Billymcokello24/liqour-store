import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { couponValidationInput } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, ["customer"]);
    const { code, subtotalKes } = couponValidationInput.parse(await request.json());
    const result = await query(
      `SELECT c.code, p.name, p.discount_type, p.discount_value, p.minimum_order_kes, p.usage_limit, c.usage_count, p.ends_at
       FROM coupons c JOIN promotions p ON p.id = c.promotion_id
       WHERE lower(c.code) = lower($1) AND p.status = 'active'
         AND now() >= p.starts_at AND now() <= p.ends_at`,
      [code],
    );
    const found = result.rows[0];
    if (!found) return NextResponse.json({ valid: false, reason: "That coupon is invalid or has expired." });
    if (found.usage_limit !== null && found.usage_count >= found.usage_limit) {
      return NextResponse.json({ valid: false, reason: "That coupon has reached its usage limit." });
    }
    if (subtotalKes < found.minimum_order_kes) {
      return NextResponse.json({ valid: false, reason: `This coupon requires a minimum order of KES ${found.minimum_order_kes.toLocaleString("en-KE")}.` });
    }
    let discountKes = 0;
    let freeDelivery = false;
    if (found.discount_type === "percentage") discountKes = Math.floor((subtotalKes * found.discount_value) / 100);
    else if (found.discount_type === "fixed") discountKes = Math.min(found.discount_value, subtotalKes);
    else if (found.discount_type === "free_delivery") freeDelivery = true;
    return NextResponse.json({
      valid: true,
      coupon: { code: found.code, name: found.name, discountKes, freeDelivery, endsAt: found.ends_at },
    });
  } catch (error) {
    return apiError(error);
  }
}
