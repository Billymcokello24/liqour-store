import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const result = await query<UserRow>(
      `SELECT id, email, first_name, last_name, phone, role, is_active, email_verified_at, created_at
       FROM users WHERE id = $1`,
      [session.userId],
    );
    const user = result.rows[0];
    if (!user?.is_active) {
      return NextResponse.json({ error: "This account is no longer active." }, { status: 403 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        emailVerified: Boolean(user.email_verified_at),
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
