import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const statusInput = z.object({
  status: z.enum(["new", "contacted", "quoted", "confirmed", "processing", "completed", "cancelled"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  try {
    const session = await requireSession(request, ["super_admin", "manager", "sales", "support"]);
    const { bookingId } = await context.params;
    const input = statusInput.parse(await request.json());
    const result = await query<{ id: string; status: string }>(
      `UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, status`,
      [input.status, bookingId],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'booking.status_updated', 'booking', $2, $3)`,
      [session.userId, bookingId, JSON.stringify({ status: input.status })],
    );
    return NextResponse.json({ booking: result.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}
