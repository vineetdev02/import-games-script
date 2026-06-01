import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Category } from "@/types/game";

/* Single source of truth = web0.2's category list. We read its JSON at
 * runtime (sibling folder) so the dashboard never keeps a divergent copy.
 * Falls back to a baked-in mirror if the file can't be read. */

const FALLBACK: Category[] = [
  { slug: "puzzles", label: "Puzzles" },
  { slug: "hypercasual", label: "Hypercasual" },
  { slug: "adventure", label: "Adventure" },
  { slug: "shooting", label: "Shooting" },
  { slug: "racing", label: "Racing" },
  { slug: "sports", label: "Sports" },
  { slug: "action", label: "Action" },
  { slug: "arcade", label: "Arcade" },
  { slug: "clicker", label: "Clicker" },
  { slug: "girls", label: "Girls" },
];

export const DEFAULT_CATEGORY = "action";

let cache: Category[] | null = null;

export function getCategories(): Category[] {
  if (cache) return cache;
  const rel = process.env.WEB02_CATEGORIES_PATH ?? "../web0.2/public/data/categories.json";
  const abs = path.resolve(process.cwd(), rel);
  try {
    const raw = readFileSync(abs, "utf-8");
    const parsed = JSON.parse(raw) as Category[];
    if (Array.isArray(parsed) && parsed.length) {
      cache = parsed;
      return cache;
    }
  } catch {
    /* fall through to baked-in mirror */
  }
  cache = FALLBACK;
  return cache;
}

export function getCategorySlugs(): string[] {
  return getCategories().map((c) => c.slug);
}

export function isValidCategory(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return getCategorySlugs().includes(slug);
}
