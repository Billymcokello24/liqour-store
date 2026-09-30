import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const changePasswordInput = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const input = changePasswordInput.parse(await request.json());
    const updated = await transaction(async (client) => {
      const result = await client.query<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE id = $1 AND is_active FOR UPDATE`,
        [session.userId],
      );
      const user = result.rows[0];
      if (!user) throw new Response("This account is no longer active.", { status: 403 });
      if (!(await bcrypt.compare(input.currentPassword, user.password_hash))) {
        throw new Response("Your current password is incorrect.", { status: 422 });
      }
      const hash = await bcrypt.hash(input.newPassword, 12);
      await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [hash, session.userId]);
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id) VALUES ($1, 'auth.password_changed', 'user', $2)`,
        [session.userId, session.userId],
      );
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload) VALUES ($1, 'in_app', 'password-changed', $2)`,
        [session.userId, JSON.stringify({ message: "Your password was changed." })],
      );
      return { changedAt: new Date().toISOString() };
    });
    return NextResponse.json({ message: "Your password has been updated.", changedAt: updated.changedAt });
  } catch (error) {
    return apiError(error);
  }
}
