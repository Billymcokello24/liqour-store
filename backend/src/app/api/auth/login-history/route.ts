import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const result = await query<{ created_at: string; ip_address: string | null; succeeded: boolean }>(
      `SELECT created_at, ip_address, succeeded FROM login_attempts
       WHERE email = $1 ORDER BY created_at DESC LIMIT 20`,
      [session.email.toLowerCase()],
    );
    return NextResponse.json({ attempts: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
