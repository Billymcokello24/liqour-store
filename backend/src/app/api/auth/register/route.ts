import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { apiError } from "@/lib/http";
import { registrationInput } from "@/lib/validation";
import { appUrl, emailShell, esc, sendLoggedEmail } from "@/lib/mailer";

export async function POST(request: NextRequest) {
  try {
    const input = registrationInput.parse(await request.json());
    const [firstName, ...lastName] = input.name.split(/\s+/);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const user = await transaction(async (client) => {
      const created = await client.query<{ id: string; email: string }>(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, marketing_consent_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END)
         RETURNING id, email`,
        [input.email.toLowerCase(), passwordHash, firstName, lastName.join(" ") || "-", input.phone, input.marketingConsent],
      );
      await client.query(
        `INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'email_verification', now() + interval '24 hours')`,
        [created.rows[0].id, tokenHash],
      );
      await client.query(
        `INSERT INTO notification_log (user_id, channel, template_key, payload)
         VALUES ($1, 'email', 'verify-email', $2)`,
        [created.rows[0].id, JSON.stringify({ email: created.rows[0].email, token: rawToken })],
      );
      return created.rows[0];
    });
    await sendLoggedEmail({
      userId: user.id,
      templateKey: "welcome",
      payload: { email: user.email },
      to: user.email,
      subject: "Welcome to Henry's Liquor Hub",
      html: emailShell(
        "Your account is ready",
        `<p>Welcome${input.name ? `, ${esc(input.name.split(" ")[0])}` : ""} — your Henry's Liquor Hub account (<strong>${esc(user.email)}</strong>) is now active.</p>` +
          `<p>Sign in at <a href="${appUrl()}">${appUrl().replace(/^https?:\/\//, "")}</a> to browse the collection, save delivery addresses and track your orders.</p>` +
          `<p>Same-day delivery in selected Nairobi areas. Drink responsibly — 18+ only.</p>`,
      ),
    });
    return NextResponse.json({ user: { id: user.id, email: user.email }, message: "Check your email to verify your account." }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
