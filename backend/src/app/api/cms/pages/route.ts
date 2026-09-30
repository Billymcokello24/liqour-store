import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { z } from "zod";

const pageInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(2).max(180),
  body: z.record(z.string(), z.unknown()),
  seoTitle: z.string().trim().max(180).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  status: z.enum(["draft", "active", "disabled"]).default("draft"),
});

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "A page slug is required." }, { status: 400 });
    const result = await query(
      `SELECT slug, title, body, seo_title, seo_description, updated_at
       FROM cms_pages WHERE slug = $1 AND status = 'active'`,
      [slug],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Page not found." }, { status: 404 });
    return NextResponse.json({ page: result.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["super_admin", "manager"]);
    const input = pageInput.parse(await request.json());
    const result = await query(
      `INSERT INTO cms_pages (slug, title, body, status, seo_title, seo_description, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
         status = EXCLUDED.status, seo_title = EXCLUDED.seo_title,
         seo_description = EXCLUDED.seo_description, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING id, slug, status, updated_at`,
      [input.slug, input.title, JSON.stringify(input.body), input.status, input.seoTitle ?? null, input.seoDescription ?? null, session.userId],
    );
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'cms.page.upserted', 'cms_page', $2, $3)`,
      [session.userId, result.rows[0].id, JSON.stringify({ slug: input.slug, status: input.status })],
    );
    return NextResponse.json({ page: result.rows[0] }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
