import { randomBytes } from "crypto";
import type { PoolClient } from "pg";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function uniqueSlug(client: PoolClient, base: string) {
  let slug = base || "product";
  for (let attempt = 0; attempt < 100; attempt++) {
    const clash = await client.query("SELECT 1 FROM products WHERE slug = $1", [slug]);
    if (clash.rowCount === 0) return slug;
    const match = /^(.+?)(?:-(\d+))?$/.exec(slug);
    slug = match?.[2] ? `${match[1]}-${Number(match[2]) + 1}` : `${slug}-2`;
  }
  throw new Error("Could not derive a unique URL slug.");
}

export class SkuTakenError extends Error {
  constructor(public readonly sku: string) {
    super(`SKU ${sku} is already assigned to another bottle.`);
  }
}

export async function resolveSku(client: PoolClient, preferred?: string) {
  const wanted = preferred?.trim();
  if (wanted) {
    const clash = await client.query("SELECT 1 FROM product_variants WHERE sku = $1", [wanted]);
    if (clash.rowCount === 0) return wanted;
    throw new SkuTakenError(wanted);
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `HLH-${randomBytes(3).toString("hex").toUpperCase()}`;
    const clash = await client.query("SELECT 1 FROM product_variants WHERE sku = $1", [candidate]);
    if (clash.rowCount === 0) return candidate;
  }
  throw new Error("Could not generate a unique SKU.");
}
