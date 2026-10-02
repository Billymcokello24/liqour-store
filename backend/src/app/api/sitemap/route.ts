import { query } from "@/lib/db";

const ORIGIN = "https://henryliqourhub.co.ke";

type Row = { path: string; lastmod: Date | string | null };

function entry(row: Row, changefreq: string, priority: string) {
  const lastmod = row.lastmod
    ? `<lastmod>${new Date(row.lastmod).toISOString().slice(0, 10)}</lastmod>`
    : "";
  return `<url><loc>${ORIGIN}${row.path}</loc>${lastmod}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

const STATIC_ROWS: Row[] = [
  { path: "/", lastmod: null },
  { path: "/shop", lastmod: null },
  { path: "/categories", lastmod: null },
  { path: "/brands", lastmod: null },
  { path: "/collections", lastmod: null },
  { path: "/offers", lastmod: null },
  { path: "/new-arrivals", lastmod: null },
  { path: "/about", lastmod: null },
  { path: "/delivery", lastmod: null },
  { path: "/responsible-drinking", lastmod: null },
  { path: "/bulk-orders", lastmod: null },
  { path: "/contact", lastmod: null },
  { path: "/faq", lastmod: null },
  { path: "/privacy", lastmod: null },
  { path: "/terms", lastmod: null },
  { path: "/refund-policy", lastmod: null },
];

export async function GET() {
  const dynamic = await query<Row>(
    `SELECT '/categories/' || slug AS path, updated_at AS lastmod FROM categories WHERE status = 'active'
     UNION ALL
     SELECT '/brands/' || slug, updated_at FROM brands WHERE status = 'active'
     UNION ALL
     SELECT '/collections/' || slug, updated_at FROM collections WHERE status = 'active'
     UNION ALL
     SELECT '/products/' || slug, updated_at FROM products WHERE status = 'active' AND deleted_at IS NULL
     UNION ALL
     SELECT '/' || slug, updated_at FROM cms_pages WHERE status = 'active'`,
  );
  const urls: string[] = [];
  for (const row of STATIC_ROWS) {
    const priority = row.path === "/" ? "1.0" : row.path === "/shop" ? "0.9" : "0.6";
    urls.push(entry(row, row.path === "/" ? "daily" : "weekly", priority));
  }
  for (const row of dynamic.rows) {
    const priority = row.path.startsWith("/products/") ? "0.8" : "0.7";
    urls.push(entry(row, "weekly", priority));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
