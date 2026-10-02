import { query } from "@/lib/db";
import { pushConfigured, sendPushToUser, type PushMessage } from "@/lib/push";

type PendingRow = {
  id: string;
  user_id: string;
  channel: string;
  template_key: string;
  payload: Record<string, unknown>;
  push_attempts: number;
};

const MAX_ATTEMPTS = 5;
const CLAIM_COOLDOWN = "interval '30 seconds'";

const TITLES: Record<string, string> = {
  "order-created": "Order placed",
  "order-confirmed": "Order confirmed",
  "order-preparing": "Order being prepared",
  "order-out_for_delivery": "Out for delivery",
  "order-delivered": "Order delivered",
  "order-cancelled": "Order cancelled",
  "order-delivery-update": "Delivery update",
  "order-received": "New order received",
  "support-reply": "Support reply",
  "password-changed": "Password changed",
  "push-welcome": "Alerts enabled",
  "push-test": "Test notification",
};

function messageFor(row: PendingRow): PushMessage {
  const payload = row.payload ?? {};
  const orderNumber = typeof payload.orderNumber === "string" ? payload.orderNumber : "";
  const totalKes = typeof payload.totalKes === "number" ? ` · KES ${payload.totalKes.toLocaleString("en-KE")}` : "";
  const message = typeof payload.message === "string" ? payload.message : "";
  const title = TITLES[row.template_key] ?? "Henry's Liquor Hub";
  const body =
    message ||
    (orderNumber ? `Order ${orderNumber}${totalKes}` : row.template_key.replace(/[-_]/g, " "));
  const url =
    row.channel === "order_alert"
      ? "/admin/orders"
      : orderNumber
        ? `/track?order=${encodeURIComponent(orderNumber)}`
        : "/account";
  return { title, body, url, tag: `${row.template_key}:${orderNumber || row.id}` };
}

async function markSent(id: string) {
  await query("UPDATE notification_log SET push_sent_at = now() WHERE id = $1", [id]);
}

async function recordFailure(row: PendingRow, error: string) {
  const attempts = row.push_attempts;
  if (attempts >= MAX_ATTEMPTS) {
    console.error("[push-worker] giving up on notification", { id: row.id, template: row.template_key, error });
    await query(
      "UPDATE notification_log SET push_sent_at = now(), push_last_error = $2 WHERE id = $1",
      [row.id, error.slice(0, 500)],
    );
  } else {
    await query(
      "UPDATE notification_log SET push_last_error = $2 WHERE id = $1",
      [row.id, error.slice(0, 500)],
    );
  }
}

let started = false;

export function startPushWorker() {
  if (started) return;
  started = true;
  const tick = async () => {
    if (!pushConfigured()) return;
    try {
      const claimed = await query<PendingRow>(
        `WITH picked AS (
           SELECT id FROM notification_log
           WHERE push_sent_at IS NULL AND user_id IS NOT NULL
             AND channel IN ('in_app', 'order_alert')
             AND push_attempts < $1
             AND created_at > now() - interval '6 hours'
             AND (push_claimed_at IS NULL OR push_claimed_at < now() - ${CLAIM_COOLDOWN})
           ORDER BY created_at
           LIMIT 20
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_log
         SET push_attempts = push_attempts + 1, push_claimed_at = now()
         FROM picked WHERE notification_log.id = picked.id
         RETURNING notification_log.id, notification_log.user_id, notification_log.channel,
                   notification_log.template_key, notification_log.payload, notification_log.push_attempts`,
        [MAX_ATTEMPTS],
      );
      for (const row of claimed.rows) {
        try {
          const result = await sendPushToUser(row.user_id, messageFor(row));
          if (result.sent >= 1 || result.subs === 0 || result.dropped === result.subs) {
            await markSent(row.id);
          } else {
            await recordFailure(row, result.lastError || "All subscription sends failed.");
          }
        } catch (error) {
          await recordFailure(row, String((error as Error).message ?? error));
        }
      }
    } catch (error) {
      console.error("[push-worker] tick failed", error);
    }
  };
  void query(
    `UPDATE notification_log SET push_sent_at = now()
     WHERE push_sent_at IS NULL AND created_at <= now() - interval '6 hours'`,
  ).catch(() => undefined);
  void tick();
  setInterval(() => void tick(), 10_000);
}
