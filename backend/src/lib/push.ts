import webPush from "web-push";
import { query } from "@/lib/db";

let configured = false;

export function pushConfigured(): boolean {
  if (configured) return true;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@henryliqourhub.co.ke",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    configured = true;
  }
  return configured;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

export type PushMessage = { title: string; body: string; url: string; tag: string };

export async function sendPushToUser(userId: string, message: PushMessage) {
  if (!pushConfigured()) return { sent: 0, dropped: 0, subs: 0, lastError: "VAPID keys not configured." };
  const rows = await query<SubscriptionRow>(
    "SELECT id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE user_id = $1",
    [userId],
  );
  let sent = 0;
  let dropped = 0;
  let lastError = "";
  await Promise.all(
    rows.rows.map(async (row) => {
      try {
        await webPush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(message),
          { TTL: 3600 },
        );
        sent += 1;
        await query("UPDATE web_push_subscriptions SET last_seen_at = now() WHERE id = $1", [row.id]);
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode ?? 0;
        if (statusCode === 404 || statusCode === 410) {
          await query("DELETE FROM web_push_subscriptions WHERE id = $1", [row.id]);
          dropped += 1;
        } else {
          lastError = `${statusCode} ${String((error as { body?: unknown }).body ?? (error as Error).message)}`.slice(0, 500);
          console.error("[push] send failed", { userId, statusCode, body: (error as { body?: unknown }).body });
        }
      }
    }),
  );
  return { sent, dropped, subs: rows.rows.length, lastError };
}

export async function upsertSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId: string | null;
  platform: string | null;
}) {
  const result = await query<{ inserted: boolean }>(
    `INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, platform)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
     SET user_id = COALESCE(EXCLUDED.user_id, web_push_subscriptions.user_id),
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_seen_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [input.userId, input.endpoint, input.p256dh, input.auth, input.platform],
  );
  return result.rows[0]?.inserted ?? false;
}

export async function removeSubscription(endpoint: string) {
  await query("DELETE FROM web_push_subscriptions WHERE endpoint = $1", [endpoint]);
}
