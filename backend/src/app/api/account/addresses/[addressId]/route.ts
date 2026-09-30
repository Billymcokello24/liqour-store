import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";
import { addressInput } from "@/lib/validation";

const patchInput = addressInput.partial().extend({ isDefault: z.boolean().optional() });

async function ownedAddress(userId: string, addressId: string) {
  const owned = await query<{ id: string }>(
    "SELECT id FROM addresses WHERE id = $1 AND user_id = $2",
    [addressId, userId],
  );
  if (!owned.rows[0]) throw new Response("Address not found.", { status: 404 });
  return addressId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  try {
    const session = await requireSession(request);
    const { addressId } = await params;
    await ownedAddress(session.userId, addressId);
    const input = patchInput.parse(await request.json());
    const map: Record<string, string> = {
      label: "label", recipientName: "recipient_name", phone: "phone",
      addressLine1: "address_line_1", addressLine2: "address_line_2", zoneId: "zone_id",
    };
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(map)) {
      if (key in input) {
        fields.push(`${column} = $${fields.length + 1}`);
        values.push((input as Record<string, unknown>)[key] ?? null);
      }
    }
    if (!fields.length && input.isDefault === undefined) {
      return NextResponse.json({ error: "No fields to update." }, { status: 422 });
    }
    values.push(addressId, session.userId);
    await transaction(async (client) => {
      if (input.isDefault) {
        await client.query("UPDATE addresses SET is_default = false WHERE user_id = $1", [session.userId]);
      }
      if (fields.length) {
        await client.query(
          `UPDATE addresses SET ${fields.join(", ")} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
          values,
        );
      }
      if (input.isDefault) {
        await client.query("UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2", [addressId, session.userId]);
      }
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'account.address_updated', 'address', $2, $3)`,
        [session.userId, addressId, JSON.stringify(input)],
      );
    });
    const result = await query(
      `SELECT a.id, a.label, a.recipient_name, a.phone, a.address_line_1, a.address_line_2,
              a.zone_id, z.name AS zone_name, z.fee_kes, a.is_default, a.created_at
       FROM addresses a LEFT JOIN delivery_zones z ON z.id = a.zone_id
       WHERE a.user_id = $1 ORDER BY a.is_default DESC, a.created_at DESC`,
      [session.userId],
    );
    return NextResponse.json({ addresses: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ addressId: string }> },
) {
  try {
    const session = await requireSession(request);
    const { addressId } = await params;
    await ownedAddress(session.userId, addressId);
    await query("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [addressId, session.userId]);
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
       VALUES ($1, 'account.address_deleted', 'address', $2)`,
      [session.userId, addressId],
    );
    const result = await query(
      `SELECT a.id, a.label, a.recipient_name, a.phone, a.address_line_1, a.address_line_2,
              a.zone_id, z.name AS zone_name, z.fee_kes, a.is_default, a.created_at
       FROM addresses a LEFT JOIN delivery_zones z ON z.id = a.zone_id
       WHERE a.user_id = $1 ORDER BY a.is_default DESC, a.created_at DESC`,
      [session.userId],
    );
    return NextResponse.json({ addresses: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
