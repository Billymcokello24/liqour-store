import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { addressInput } from "@/lib/validation";

const SELECT = `
  SELECT a.id, a.label, a.recipient_name, a.phone, a.address_line_1, a.address_line_2,
         a.zone_id, z.name AS zone_name, z.fee_kes, a.is_default, a.created_at
  FROM addresses a
  LEFT JOIN delivery_zones z ON z.id = a.zone_id
  WHERE a.user_id = $1
  ORDER BY a.is_default DESC, a.created_at DESC`;

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const result = await query<{ id: string }>(SELECT, [session.userId]);
    const zones = await query(
      `SELECT id, name, fee_kes, minimum_order_kes, estimated_minutes
       FROM delivery_zones WHERE is_active = true ORDER BY name`,
    );
    return NextResponse.json({ addresses: result.rows, zones: zones.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const input = addressInput.parse(await request.json());
    if (input.zoneId) {
      const zone = await query(`SELECT id FROM delivery_zones WHERE id = $1 AND is_active = true`, [input.zoneId]);
      if (!zone.rows[0]) throw new Response("Choose a valid delivery zone.", { status: 422 });
    }
    const address = await transaction(async (client) => {
      if (input.isDefault) {
        await client.query("UPDATE addresses SET is_default = false WHERE user_id = $1", [session.userId]);
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO addresses (user_id, label, recipient_name, phone, address_line_1, address_line_2, zone_id, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          session.userId, input.label, input.recipientName, input.phone,
          input.addressLine1, input.addressLine2 ?? null, input.zoneId ?? null, input.isDefault,
        ],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'account.address_created', 'address', $2, $3)`,
        [session.userId, created.rows[0].id, JSON.stringify({ label: input.label })],
      );
      return created.rows[0].id;
    });
    const result = await query(SELECT, [session.userId]);
    return NextResponse.json({ addresses: result.rows, createdId: address }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
