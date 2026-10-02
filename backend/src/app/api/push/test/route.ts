import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { pushConfigured } from "@/lib/push";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    if (!pushConfigured()) {
      return NextResponse.json({ error: "Push is not configured on this server." }, { status: 503 });
    }
    await query(
      `INSERT INTO notification_log (user_id, channel, template_key, payload)
       VALUES ($1, 'in_app', 'push-test', $2)`,
      [
        session.userId,
        JSON.stringify({ message: "This is what your order and delivery alerts will look like." }),
      ],
    );
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
