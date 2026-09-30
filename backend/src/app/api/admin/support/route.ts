import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const ADMIN_ROLES = ["super_admin", "manager", "support"] as const;

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const status = request.nextUrl.searchParams.get("status");
    const result = await query(
      `SELECT t.id, t.ticket_number, t.subject, t.category, t.status, t.priority, t.created_at, t.updated_at,
         u.first_name, u.last_name, u.email, u.phone,
         o.order_number,
         (SELECT count(*)::int FROM support_messages m WHERE m.ticket_id = t.id) AS message_count
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN orders o ON o.id = t.order_id
       ${status && status !== "all" ? "WHERE t.status = $1" : ""}
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC
       LIMIT 100`,
      status && status !== "all" ? [status] : [],
    );
    return NextResponse.json({ tickets: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
