import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const result = await query(
      `SELECT c.name, c.slug, c.description, c.image_url, c.seo_title, c.seo_description,
         COALESCE((SELECT count(*)::int FROM products p
           WHERE p.category_id = c.id AND p.status = 'active' AND p.deleted_at IS NULL), 0) AS product_count
       FROM categories c WHERE c.status = 'active'
       ORDER BY c.sort_order, c.name`,
    );
    return NextResponse.json({ categories: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
