import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { bannerPatch } from "@/lib/validation";

const ADMIN_ROLES = ["super_admin", "manager"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ bannerId: string }> }) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const { bannerId } = await params;
    const input = bannerPatch.parse(await request.json());
    const fields: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = {
      heading: "heading", body: "body", ctaLabel: "cta_label", ctaUrl: "cta_url",
      desktopImageUrl: "desktop_image_url", mobileImageUrl: "mobile_image_url",
      startsAt: "starts_at", endsAt: "ends_at", sortOrder: "sort_order", isActive: "is_active",
    };
    for (const [key, column] of Object.entries(map)) {
      if (key in input) {
        fields.push(`${column} = $${fields.length + 1}`);
        values.push((input as Record<string, unknown>)[key] ?? null);
      }
    }
    if (!fields.length) return NextResponse.json({ error: "No fields to update." }, { status: 422 });
    values.push(bannerId);
    const updated = await query(
      `UPDATE banners SET ${fields.join(", ")}, updated_at = now() WHERE id = $${values.length}
       RETURNING id, heading, is_active`,
      values,
    );
    if (!updated.rows[0]) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'banner.updated', 'banner', $2, $3)`,
      [session.userId, bannerId, JSON.stringify(input)],
    );
    return NextResponse.json({ banner: updated.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ bannerId: string }> }) {
  try {
    const session = await requireSession(request, ["super_admin"]);
    const { bannerId } = await params;
    const deleted = await query("DELETE FROM banners WHERE id = $1 RETURNING id", [bannerId]);
    if (!deleted.rows[0]) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id) VALUES ($1, 'banner.deleted', 'banner', $2)`,
      [session.userId, bannerId],
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
