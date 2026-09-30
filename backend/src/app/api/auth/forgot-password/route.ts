import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { generateRawToken, hashToken } from "@/lib/tokens";
import { z } from "zod";

const inputSchema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  try {
    const { email } = inputSchema.parse(await request.json());
    const genericResponse = NextResponse.json({ message: "If the address exists, a reset link was sent." });
    const user = await query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE email = $1 AND is_active",
      [email.toLowerCase()],
    );
    const found = user.rows[0];
    if (!found) return genericResponse;

    const rawToken = generateRawToken();
    await transaction(async (client) => {
      await client.query(
        `UPDATE verification_tokens SET consumed_at = now()
         WHERE user_id = $1 AND purpose = 'password_reset' AND consumed_at IS NULL`,
        [found.id],
      );
      await client.query(
        `INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'password_reset', now() + interval '60 minutes')`,
        [found.id, hashToken(rawToken)],
      );
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'email', 'password-reset', $2)`,
        [found.id, JSON.stringify({ email: found.email, token: rawToken, expiresInMinutes: 60 })],
      );
    });
    return genericResponse;
  } catch (error) {
    return apiError(error);
  }
}
