import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const result = await query(
      `SELECT booking_number, event_type, event_date, guest_count, budget_kes, location, status, created_at
       FROM bookings WHERE customer_id = $1 OR lower(email) = $2
       ORDER BY created_at DESC LIMIT 50`,
      [session.userId, session.email.toLowerCase()],
    );
    return NextResponse.json({ bookings: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
