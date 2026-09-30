import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Uploaded images are written by POST /api/upload into the frontend project's
// public/uploads folder. The Vite dev server proxies /uploads here, and a
// static host can serve the same files directly, so the backend must be able
// to return them. Files are addressed by their storage key filename only.
const UPLOADS_DIR = path.join(process.cwd(), "..", "public", "uploads");

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  if (!SAFE_FILENAME.test(file) || file.includes("..")) {
    return new NextResponse("Invalid file name.", { status: 400 });
  }
  const ext = (file.split(".").pop() ?? "").toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  if (!contentType) {
    return new NextResponse("Unsupported file type.", { status: 415 });
  }
  try {
    const data = await readFile(path.join(UPLOADS_DIR, file));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found.", { status: 404 });
  }
}
