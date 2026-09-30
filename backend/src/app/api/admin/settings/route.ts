import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const ADMIN_ROLES = ["super_admin", "manager"] as const;

const settingsInput = z.object({
  settings: z.record(z.string(), z.unknown()).refine(
    (value) => Object.keys(value).length > 0 && Object.keys(value).length <= 20,
    "Provide between 1 and 20 settings keys per request.",
  ),
});

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const result = await query("SELECT key, value, updated_at FROM settings ORDER BY key");
    return NextResponse.json({ settings: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const { settings } = settingsInput.parse(await request.json());
    const updated: string[] = [];
    for (const [key, value] of Object.entries(settings)) {
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) {
        return NextResponse.json({ error: `Invalid setting key: ${key}` }, { status: 422 });
      }
      await query(
        `INSERT INTO settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), session.userId],
      );
      updated.push(key);
    }
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'settings.updated', 'settings', NULL, $2)`,
      [session.userId, JSON.stringify({ keys: updated })],
    );
    return NextResponse.json({ updated });
  } catch (error) {
    return apiError(error);
  }
}
