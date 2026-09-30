import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const [categories, brands] = await Promise.all([
      query(
        `SELECT id, name, slug
         FROM categories
         WHERE status = 'active'
         ORDER BY sort_order ASC, name ASC`,
      ),
      query(
        `SELECT id, name, slug
         FROM brands
         WHERE status = 'active'
         ORDER BY name ASC`,
      ),
    ]);
    return NextResponse.json({
      categories: categories.rows,
      brands: brands.rows,
    });
  } catch (error) {
    return apiError(error);
  }
}
