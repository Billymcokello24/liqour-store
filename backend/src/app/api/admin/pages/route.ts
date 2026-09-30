import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager"]);
    const result = await query(
      `SELECT p.slug, p.title, p.status, p.seo_title, p.seo_description, p.body, p.updated_at,
         coalesce(nullif(trim(u.first_name || ' ' || u.last_name), ''), u.email) AS updated_by
       FROM cms_pages p LEFT JOIN users u ON u.id = p.updated_by
       ORDER BY p.updated_at DESC`,
    );
    return NextResponse.json({ pages: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
