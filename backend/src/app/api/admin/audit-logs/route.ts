import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const ADMIN_ROLES = ["super_admin", "manager"] as const;

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
    const result = await query(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.old_value, a.new_value, a.ip_address, a.created_at,
         coalesce(nullif(trim(u.first_name || ' ' || u.last_name), ''), u.email, 'System') AS actor
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       WHERE ($1::text IS NULL OR a.resource_type = $1)
       ORDER BY a.created_at DESC LIMIT $2`,
      [resource ?? null, limit],
    );
    return NextResponse.json({ events: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
