import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const result = await query(
      `SELECT b.name, b.slug, b.description, b.logo_url, b.image_url,
         COALESCE((SELECT count(*)::int FROM products p
           WHERE p.brand_id = b.id AND p.status = 'active' AND p.deleted_at IS NULL), 0) AS product_count
       FROM brands b WHERE b.status = 'active'
       ORDER BY b.name`,
    );
    return NextResponse.json({ brands: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
