import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";
import { bannerImageField } from "@/lib/validation";

const ADMIN_ROLES = ["super_admin", "manager"] as const;

const bannerInput = z.object({
  heading: z.string().trim().min(2).max(180),
  body: z.string().trim().max(500).optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: z.string().trim().max(500).optional(),
  desktopImageUrl: bannerImageField,
  mobileImageUrl: bannerImageField.optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [...ADMIN_ROLES]);
    const result = await query(
      `SELECT id, heading, body, cta_label, cta_url, desktop_image_url, mobile_image_url,
         starts_at, ends_at, sort_order, is_active, updated_at
       FROM banners ORDER BY sort_order, created_at DESC`,
    );
    return NextResponse.json({ banners: result.rows });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, [...ADMIN_ROLES]);
    const input = bannerInput.parse(await request.json());
    const created = await query(
      `INSERT INTO banners (heading, body, cta_label, cta_url, desktop_image_url, mobile_image_url,
         starts_at, ends_at, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9, $10)
       RETURNING id, heading, is_active`,
      [input.heading, input.body ?? null, input.ctaLabel ?? null, input.ctaUrl ?? null,
        input.desktopImageUrl, input.mobileImageUrl ?? null, input.startsAt ?? null,
        input.endsAt ?? null, input.sortOrder, input.isActive],
    );
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'banner.created', 'banner', $2, $3)`,
      [session.userId, created.rows[0].id, JSON.stringify({ heading: input.heading })],
    );
    return NextResponse.json({ banner: created.rows[0] }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
