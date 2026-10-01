import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { generateRawToken, hashToken } from "@/lib/tokens";
import { appUrl, emailShell, sendLoggedEmail } from "@/lib/mailer";
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
    });
    await sendLoggedEmail({
      userId: found.id,
      templateKey: "password-reset",
      payload: { email: found.email, expiresInMinutes: 60 },
      to: found.email,
      subject: "Reset your Henry's Liquor Hub password",
      html: emailShell(
        "Reset your password",
        `<p>We received a request to reset the password for <strong>${found.email}</strong>.</p>` +
          `<p style="margin:20px 0"><a href="${appUrl()}/reset-password?token=${encodeURIComponent(rawToken)}" style="display:inline-block;padding:12px 22px;background:#1d1b16;color:#ffffff;text-decoration:none;font-size:14px">Choose a new password</a></p>` +
          `<p>This link expires in 60 minutes. If you did not request a reset, you can safely ignore this email — your password stays unchanged.</p>`,
      ),
    });
    return genericResponse;
  } catch (error) {
    return apiError(error);
  }
}
