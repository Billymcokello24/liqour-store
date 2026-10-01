import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/auth";
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
  await upsertSubscription({
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userId: session?.userId ?? null,
    platform,
  });
  return NextResponse.json({ subscribed: true, linked: Boolean(session) });
}

export async function DELETE(request: NextRequest) {
  const parsed = z.object({ endpoint: z.string().url().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await removeSubscription(parsed.data.endpoint);
  return NextResponse.json({ unsubscribed: true });
}
