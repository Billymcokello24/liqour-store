import { createTransport, type Transporter } from "nodemailer";
import { query } from "@/lib/db";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const { MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS } = process.env;
  if (!MAIL_HOST || !MAIL_USERNAME || !MAIL_PASSWORD || !MAIL_FROM_ADDRESS) return null;
  const port = Number(MAIL_PORT ?? 587);
  transporter ??= createTransport({
    host: MAIL_HOST,
    port,
    secure: port === 465,
    auth: { user: MAIL_USERNAME, pass: MAIL_PASSWORD },
  });
  return transporter;
}

export function emailEnabled() {
  return getTransporter() !== null;
}

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://henryliqourhub.co.ke";
}

export function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailShell(heading: string, body: string) {
  return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:26px;border:1px solid #e5e0d3;color:#1d1b16;background:#ffffff">
  <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8a7a2f">HENRY'S LIQUOR HUB</div>
  <h1 style="font-size:22px;margin:10px 0 14px;font-weight:600">${heading}</h1>
  <div style="font-size:14px;line-height:1.65;color:#33302a">${body}</div>
  <p style="margin-top:24px;font-size:11px;color:#8c877c;border-top:1px solid #eee8da;padding-top:12px">
    <a href="${appUrl()}" style="color:#8a7a2f">henryliqourhub.co.ke</a> &middot; Same-day delivery in selected Nairobi areas &middot; Drink responsibly, 18+ only
  </p>
</div>`;
}

type LoggedEmail = {
  userId?: string | null;
  templateKey: string;
  payload: Record<string, unknown>;
  to: string;
  subject: string;
  html: string;
};

export async function sendLoggedEmail({ userId, templateKey, payload, to, subject, html }: LoggedEmail): Promise<void> {
  const log = await query<{ id: string }>(
    `INSERT INTO notification_log (user_id, channel, template_key, payload)
     VALUES ($1, 'email', $2, $3) RETURNING id`,
    [userId ?? null, templateKey, JSON.stringify(payload)],
  );
  const logId = log.rows[0]?.id;
  const transport = getTransporter();
  if (!transport) {
    if (logId) await query("UPDATE notification_log SET failed_at = now() WHERE id = $1", [logId]);
    return;
  }
  try {
    await transport.sendMail({
      from: `HENRY'S LIQUOR HUB <${process.env.MAIL_FROM_ADDRESS}>`,
      to,
      subject,
      html,
    });
    if (logId) await query("UPDATE notification_log SET sent_at = now() WHERE id = $1", [logId]);
  } catch {
    if (logId) await query("UPDATE notification_log SET failed_at = now() WHERE id = $1", [logId]);
  }
}
