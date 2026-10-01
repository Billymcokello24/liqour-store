import { NextResponse } from "next/server";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export async function GET() {
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push is not configured on this server." }, { status: 503 });
  }
  return NextResponse.json({ key: vapidPublicKey() });
}
