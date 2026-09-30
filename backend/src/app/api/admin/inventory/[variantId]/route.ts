import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { apiError } from "@/lib/http";

const adjustmentInput = z.object({
  change: z.number().int().min(-10000).max(10000).refine((value) => value !== 0),
  notes: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ variantId: string }> },
) {
  try {
    const session = await requireSession(request, [
      "super_admin",
      "manager",
      "inventory",
    ]);
    const { variantId } = await context.params;
    const input = adjustmentInput.parse(await request.json());
    const variant = await transaction(async (client) => {
      const current = await client.query<{
        stock_on_hand: number;
        reserved_stock: number;
      }>(
        `SELECT stock_on_hand, reserved_stock
         FROM product_variants
         WHERE id = $1
         FOR UPDATE`,
        [variantId],
      );
      if (!current.rows[0]) {
        throw new Response("Product variant not found.", { status: 404 });
      }
      const nextStock = current.rows[0].stock_on_hand + input.change;
      if (nextStock < current.rows[0].reserved_stock) {
        throw new Response(
          "Stock cannot be reduced below the quantity reserved for orders.",
          { status: 422 },
        );
      }
      const updated = await client.query<{ stock_on_hand: number }>(
        `UPDATE product_variants
         SET stock_on_hand = $1, updated_at = now()
         WHERE id = $2
         RETURNING stock_on_hand`,
        [nextStock, variantId],
      );
      await client.query(
        `INSERT INTO inventory_transactions (
          variant_id, change_quantity, reason, notes, created_by
        ) VALUES ($1, $2, 'adjustment', $3, $4)`,
        [variantId, input.change, input.notes ?? null, session.userId],
      );
      return updated.rows[0];
    });
    return NextResponse.json({ variant });
  } catch (error) {
    return apiError(error);
  }
}
