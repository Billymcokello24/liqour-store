import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requireSession(request, ["super_admin", "manager"]);
    const { slug } = await context.params;
    const result = await query<{ id: string; title: string }>(
      `DELETE FROM cms_pages WHERE slug = $1 RETURNING id, title`,
      [slug],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, old_value)
       VALUES ($1, 'cms.page.deleted', 'cms_page', $2, $3)`,
      [
        session.userId,
        result.rows[0].id,
        JSON.stringify({ slug, title: result.rows[0].title }),
      ],
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
