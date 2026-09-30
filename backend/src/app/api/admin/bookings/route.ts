import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager", "sales", "support"]);
    const result = await query(
      `SELECT id, booking_number, name, email, phone, event_type, event_date,
              guest_count, budget_kes, location, notes, status, created_at
       FROM bookings
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    return NextResponse.json({ bookings: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
