import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSession } from "@/lib/auth"
import { query } from "@/lib/db"
import { apiError } from "@/lib/http"

const input = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(1000).optional(),
  imageUrl: z.string().trim().max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, ["super_admin", "manager", "sales", "inventory"])
    const result = await query(
      `SELECT b.id, b.name, b.slug, b.description, b.logo_url, b.image_url, b.status,
              (SELECT count(*)::int FROM products p
               WHERE p.brand_id = b.id AND p.deleted_at IS NULL) AS product_count
       FROM brands b
       ORDER BY b.name ASC`,
    )
    return NextResponse.json({ brands: result.rows })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, ["super_admin", "manager"])
    const value = input.parse(await request.json())
    const result = await query(
      `INSERT INTO brands (name, slug, description, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, description, image_url, status, 0 AS product_count`,
      [value.name, value.slug, value.description ?? null, value.imageUrl ?? null],
    )
    await query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, new_value)
       VALUES ($1, 'brand.created', 'brand', $2, $3)`,
      [session.userId, result.rows[0].id, JSON.stringify(value)],
    )
    return NextResponse.json({ brand: result.rows[0] }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
