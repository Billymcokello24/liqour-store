import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const updateInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().max(1000).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  status: z.enum(["active", "draft", "disabled"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const session = await requireSession(request, ["super_admin", "manager", "sales"]);
    const { categoryId } = await context.params;
    const input = updateInput.parse(await request.json());
    const result = await query<{ id: string; name: string; slug: string; image_url: string | null; status: string }>(
      `UPDATE categories
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           description = COALESCE($3, description),
           image_url = COALESCE($4, image_url),
           status = COALESCE($5, status),
           updated_at = now()
       WHERE id = $6
       RETURNING id, name, slug, image_url, status`,
      [input.name ?? null, input.slug ?? null, input.description ?? null, input.imageUrl ?? null, input.status ?? null, categoryId],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'category.updated', 'category', $2, $3)`,
      [session.userId, categoryId, JSON.stringify(input)],
    );
    return NextResponse.json({ category: result.rows[0] });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const session = await requireSession(request, ["super_admin", "manager"]);
    const { categoryId } = await context.params;
    const result = await query<{ id: string }>(
      `DELETE FROM categories WHERE id = $1 RETURNING id`,
      [categoryId],
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'category.deleted', 'category', $2, $3)`,
      [session.userId, categoryId, JSON.stringify({ deleted: true })],
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
