import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const STAFF_ROLES = ["manager", "sales", "inventory", "delivery", "support"] as const;

const staffInput = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  role: z.enum(STAFF_ROLES),
  phone: z.string().trim().min(8).max(32).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager"]);
    const result = await query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.created_at, u.is_active,
              (SELECT max(la.created_at) FROM login_attempts la
                WHERE lower(la.email) = u.email AND la.succeeded) AS last_sign_in_at
       FROM users u WHERE u.role <> 'customer' ORDER BY u.created_at DESC`,
    );
    return NextResponse.json({ staff: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

function readablePassword() {
  const words = ["cellar", "barrel", "reserve", "malt", "harvest", "brass", "oaken", "vintage"];
  const digits = randomBytes(2).readUInt16LE(0) % 90 + 10;
  return `${words[randomBytes(1)[0] % words.length]}-${randomBytes(4).toString("hex")}-${digits}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["super_admin"]);
    const input = staffInput.parse(await request.json());
    const email = input.email.toLowerCase();
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows[0]) throw new Response("A team member already uses that email.", { status: 409 });

    const temporaryPassword = readablePassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const member = await transaction(async (client) => {
      const created = await client.query<{ id: string; email: string; role: string }>(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, role`,
        [email, passwordHash, input.firstName, input.lastName, input.phone ?? null, input.role],
      );
      await client.query(
        `INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'password_reset', now() + interval '72 hours')`,
        [created.rows[0].id, tokenHash],
      );
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'email', 'staff-invite', $2)`,
        [created.rows[0].id, JSON.stringify({ email, role: input.role, token: rawToken })],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
         VALUES ($1, 'staff.invited', 'user', $2, $3)`,
        [session.userId, created.rows[0].id, JSON.stringify({ email, role: input.role })],
      );
      return created.rows[0];
    });

    return NextResponse.json(
      {
        staff: { ...member, temporaryPassword },
        message: "Team member invited. Share the temporary password over a trusted channel.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
