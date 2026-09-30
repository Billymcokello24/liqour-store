import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { z } from "zod";

const loginInput = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

const MAX_FAILED_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function recordAttempt(email: string, ip: string | null, succeeded: boolean) {
  await query(
    `INSERT INTO login_attempts (email, ip_address, succeeded) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), ip, succeeded],
  ).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = loginInput.parse(await request.json());
    const normalizedEmail = email.toLowerCase();
    const ip = clientIp(request);

    const recent = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM login_attempts
       WHERE email = $1 AND succeeded = false AND created_at > now() - interval '${WINDOW_MINUTES} minutes'`,
      [normalizedEmail],
    );
    if (recent.rows[0].count >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many failed sign-in attempts. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    const result = await query<{ id: string; email: string; password_hash: string; role: "customer" | "super_admin" | "manager" | "sales" | "inventory" | "delivery" | "support"; is_active: boolean }>(
      "SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1",
      [normalizedEmail],
    );
    const user = result.rows[0];
    if (!user?.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      await recordAttempt(normalizedEmail, ip, false);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await recordAttempt(normalizedEmail, ip, true);
    const token = await createSession({ userId: user.id, email: user.email, role: user.role });
    return NextResponse.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    return apiError(error);
  }
}
