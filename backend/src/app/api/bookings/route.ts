import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { bookingInput } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const input = bookingInput.parse(await request.json());
    const result = await query<{ booking_number: string }>(
      `INSERT INTO bookings (booking_number, name, email, phone, event_type, event_date, guest_count, budget_kes, location, notes)
       VALUES ('BKG-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)),
         $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING booking_number`,
      [input.name, input.email.toLowerCase(), input.phone, input.eventType, input.eventDate, input.guests, input.budget ?? null, input.location, input.notes ?? null],
    );
    return NextResponse.json({ bookingNumber: result.rows[0].booking_number }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
