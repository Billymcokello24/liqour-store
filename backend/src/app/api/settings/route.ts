import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";

const PUBLIC_KEYS = [
  "business",
  "contact",
  "delivery",
  "social",
  "hours",
  "age_verification",
  "legal",
] as const;

export async function GET() {
  try {
    const result = await query<{ key: string; value: unknown }>(
      "SELECT key, value FROM settings WHERE key = ANY($1)",
      [[...PUBLIC_KEYS]],
    );
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) settings[row.key] = row.value;
    return NextResponse.json({ settings });
  } catch (error) {
    return apiError(error);
  }
}
