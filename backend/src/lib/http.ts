import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function apiError(error: unknown) {
  if (error instanceof Response) {
    const message = await error.text();
    return NextResponse.json({ error: message || "Request failed." }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request.", details: error.flatten() }, { status: 422 });
  }
  console.error(error);
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}
