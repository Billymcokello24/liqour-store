import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, [
      "super_admin",
      "manager",
      "sales",
      "inventory",
      "support",
    ]);
    const result = await query(
      `SELECT m.id, m.public_url, m.alt_text, m.width, m.height, m.byte_size, m.mime_type, m.created_at,
              (SELECT p.name FROM product_images pi JOIN products p ON p.id = pi.product_id
               WHERE pi.media_id = m.id LIMIT 1) AS used_by
       FROM media_assets m
       ORDER BY m.created_at DESC
       LIMIT 80`,
    );
    return NextResponse.json({ media: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
