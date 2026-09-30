import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { apiError } from "@/lib/http";
import { readImageSize } from "@/lib/image";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Files are written to the frontend project's public/uploads directory so the
// Vite dev server (and any static host) can fetch them at /uploads/<filename>.
const UPLOADS_DIR = path.join(process.cwd(), "..", "public", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, [
      "super_admin",
      "manager",
      "sales",
      "inventory",
    ]);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      return NextResponse.json(
        { error: "Only JPEG, PNG and WebP images are accepted." },
        { status: 400 },
      );
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds the 8 MB limit." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dimensions = readImageSize(buffer);
    if (!dimensions) {
      return NextResponse.json(
        { error: "That file is not a readable image." },
        { status: 400 },
      );
    }

    await mkdir(UPLOADS_DIR, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await writeFile(path.join(UPLOADS_DIR, filename), buffer);
    const publicUrl = `/uploads/${filename}`;

    const result = await query<{ id: string }>(
      `INSERT INTO media_assets (storage_key, public_url, mime_type, byte_size, width, height, alt_text, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (storage_key) DO UPDATE SET public_url = EXCLUDED.public_url
       RETURNING id`,
      [
        filename,
        publicUrl,
        mimeType,
        file.size,
        dimensions.width,
        dimensions.height,
        file.name.replace(/\.[a-z]+$/i, "").slice(0, 120) || "Upload",
        session.userId,
      ],
    );

    return NextResponse.json({
      media: { id: result.rows[0].id, url: publicUrl },
      url: publicUrl,
    });
  } catch (error) {
    return apiError(error);
  }
}
