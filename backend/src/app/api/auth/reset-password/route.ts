import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { hashToken, tokenMatches } from "@/lib/tokens";
import { z } from "zod";

const inputSchema = z
  .object({
    token: z.string().min(16).max(128),
    password: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json());
    const existing = await query<{ id: string; user_id: string; token_hash: string }>(
      `SELECT id, user_id, token_hash FROM verification_tokens
       WHERE token_hash = $1 AND purpose = 'password_reset' AND consumed_at IS NULL AND expires_at > now()`,
      [hashToken(input.token)],
    );
    const tokenRow = existing.rows[0];
    if (!tokenRow || !tokenMatches(input.token, tokenRow.token_hash)) {
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    await transaction(async (client) => {
      await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 AND is_active`, [passwordHash, tokenRow.user_id]);
      await client.query(`UPDATE verification_tokens SET consumed_at = now() WHERE id = $1`, [tokenRow.id]);
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'email', 'password-changed', '{}'::jsonb)`,
        [tokenRow.user_id],
      );
    });
    return NextResponse.json({ message: "Your password has been updated. Sign in with your new password." });
  } catch (error) {
    return apiError(error);
  }
}
