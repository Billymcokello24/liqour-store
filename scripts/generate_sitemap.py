#!/usr/bin/env python3
"""Regenerates public/sitemap.xml from the live catalogue for henryliquorhub.co.ke."""
import subprocess
from datetime import date
from pathlib import Path

DOMAIN = "https://henryliquorhub.co.ke"
OUT = Path(__file__).resolve().parent.parent / "public" / "sitemap.xml"
STATIC = ["/", "/shop", "/categories", "/brands", "/offers", "/new-arrivals", "/collections"]


def rows(sql: str) -> list[str]:
    result = subprocess.run(
        ["docker", "exec", "-i", "backend-postgres-1", "psql", "-U", "henrys", "-d", "henrys_liquor_hub", "-At", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def main() -> None:
    today = date.today().isoformat()
    urls: list[tuple[str, str, str]] = [(path, today, "daily") for path in STATIC]
    urls += [(f"/categories/{slug}", today, "weekly") for slug in rows("SELECT slug FROM categories WHERE status = 'active' ORDER BY updated_at DESC")]
    urls += [(f"/brands/{slug}", today, "weekly") for slug in rows("SELECT slug FROM brands WHERE status = 'active' ORDER BY updated_at DESC")]
    urls += [(f"/collections/{slug}", today, "weekly") for slug in rows("SELECT slug FROM collections WHERE status = 'active' ORDER BY updated_at DESC")]
    urls += [
        (f"/products/{slug}", modified, "weekly")
        for slug, modified in (
            row.split("|")
            for row in rows(
                "SELECT slug || '|' || to_char(updated_at, 'YYYY-MM-DD') FROM products WHERE status = 'active' AND deleted_at IS NULL ORDER BY updated_at DESC"
            )
        )
    ]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, lastmod, freq in urls:
        lines.append(f"  <url><loc>{DOMAIN}{path}</loc><lastmod>{lastmod}</lastmod><changefreq>{freq}</changefreq><priority>0.7</priority></url>")
    lines.append("</urlset>")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(urls)} URLs to {OUT}")


if __name__ == "__main__":
    main()
