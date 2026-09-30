import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const profileInput = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(32),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const input = profileInput.parse(await request.json());
    const result = await query<{ id: string; email: string; first_name: string; last_name: string; phone: string | null }>(
      `UPDATE users SET first_name = $1, last_name = $2, phone = $3, updated_at = now()
       WHERE id = $4 RETURNING id, email, first_name, last_name, phone`,
      [input.firstName, input.lastName, input.phone, session.userId],
    );
    const user = result.rows[0];
    if (!user) throw new Response("Account not found.", { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'account.profile_updated', 'user', $2, $3)`,
      [session.userId, session.userId, JSON.stringify({ firstName: user.first_name, last_name: user.last_name, phone: user.phone })],
    );
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: session.role,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
