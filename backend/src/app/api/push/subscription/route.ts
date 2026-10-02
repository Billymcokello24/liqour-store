import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { pushConfigured, removeSubscription, upsertSubscription } from "@/lib/push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(10).max(512),
  }),
});

export async function POST(request: NextRequest) {
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push is not configured on this server." }, { status: 503 });
  }
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  const session = await readSession(request);
  const userAgent = request.headers.get("user-agent") ?? "";
  const platform = /android/i.test(userAgent)
    ? "android"
    : /iphone|ipad|ios/i.test(userAgent)
      ? "ios"
      : /mac/i.test(userAgent)
        ? "macos"
        : /windows/i.test(userAgent)
          ? "windows"
          : /linux/i.test(userAgent)
            ? "linux"
            : null;
  const isNew = await upsertSubscription({
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userId: session?.userId ?? null,
    platform,
  });
  if (isNew && session?.userId) {
    await query(
      `INSERT INTO notification_log (user_id, channel, template_key, payload)
       VALUES ($1, 'in_app', 'push-welcome', $2)`,
      [
        session.userId,
        JSON.stringify({ message: "Alerts are on. Order and delivery updates will appear here, even with the app closed." }),
      ],
    ).catch(() => undefined);
  }
  return NextResponse.json({ subscribed: true, linked: Boolean(session) });
}

export async function DELETE(request: NextRequest) {
  const parsed = z.object({ endpoint: z.string().url().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await removeSubscription(parsed.data.endpoint);
  return NextResponse.json({ unsubscribed: true });
}
