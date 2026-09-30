import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const scope = request.nextUrl.searchParams.get("scope") === "admin" ? "AND channel <> 'in_app'" : "";
    const result = await query(
      `SELECT id, channel, template_key, payload, is_read, sent_at, failed_at, created_at
       FROM notification_log WHERE user_id = $1 ${scope}
       ORDER BY created_at DESC LIMIT 50`,
      [session.userId],
    );
    const unread = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notification_log WHERE user_id = $1 AND is_read = false ${scope}`,
      [session.userId],
    );
    return NextResponse.json({ notifications: result.rows, unreadCount: unread.rows[0].count });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(request);
    const input = z
      .object({ id: z.string().uuid().optional(), markAll: z.boolean().optional() })
      .parse(await request.json());
    if (input.markAll) {
      await query("UPDATE notification_log SET is_read = true WHERE user_id = $1", [session.userId]);
      return NextResponse.json({ updated: "all" });
    }
    if (!input.id) return NextResponse.json({ error: "An notification id or markAll is required." }, { status: 400 });
    const result = await query(
      "UPDATE notification_log SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING id",
      [input.id, session.userId],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ updated: true });
  } catch (error) {
    return apiError(error);
  }
}
