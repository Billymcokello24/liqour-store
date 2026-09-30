import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { hashToken } from "@/lib/tokens";
import { z } from "zod";

const inputSchema = z.object({ token: z.string().min(16).max(128) });

export async function POST(request: NextRequest) {
  try {
    const { token } = inputSchema.parse(await request.json());
    const existing = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM verification_tokens
       WHERE token_hash = $1 AND purpose = 'email_verification' AND consumed_at IS NULL AND expires_at > now()`,
      [hashToken(token)],
    );
    const tokenRow = existing.rows[0];
    if (!tokenRow) {
      return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
    }
    await query(`UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`, [tokenRow.user_id]);
    await query(`UPDATE verification_tokens SET consumed_at = now() WHERE id = $1`, [tokenRow.id]);
    return NextResponse.json({ message: "Your email has been verified. You can now sign in." });
  } catch (error) {
    return apiError(error);
  }
}
