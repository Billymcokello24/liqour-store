import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateRawToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function tokenMatches(raw: string, storedHash: string) {
  const candidate = Buffer.from(hashToken(raw));
  const stored = Buffer.from(storedHash);
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
