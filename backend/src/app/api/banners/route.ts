import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const result = await query(
      `SELECT heading, body, cta_label, cta_url, desktop_image_url, mobile_image_url, sort_order
       FROM banners
       WHERE is_active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
       ORDER BY sort_order`,
    );
    return NextResponse.json({ banners: result.rows });
  } catch (error) {
    return apiError(error);
  }
}
