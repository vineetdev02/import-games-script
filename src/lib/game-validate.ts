import "server-only";
import { isValidCategory } from "./categories";
import type { GameRow } from "@/types/game";

/* Data-level validation for a game row — the non-image half of the health
 * scan. Catches missing/garbage fields that would render a broken page even
 * when the thumbnail loads fine (e.g. blank title, "about:blank" play URL,
 * a category that isn't one of our canonical slugs). */

export type Severity = "error" | "warn";
export interface Issue {
  label: string;
  severity: Severity;
}

const PLACEHOLDER_HINTS = ["placeholder", "about:blank", "data:image"];

export function validateGameData(g: Partial<GameRow>): Issue[] {
  const issues: Issue[] = [];

  const title = (g.title ?? "").trim();
  if (!title) issues.push({ label: "missing title", severity: "error" });
  else if (title.toLowerCase() === "untitled") issues.push({ label: "placeholder title", severity: "error" });

  const play = (g.play_url ?? "").trim();
  if (!play || play === "about:blank") issues.push({ label: "no play URL", severity: "error" });
  else if (!/^https?:\/\//i.test(play)) issues.push({ label: "invalid play URL", severity: "error" });

  const cat = (g.category ?? "").trim();
  if (!cat) issues.push({ label: "no category", severity: "error" });
  else if (!isValidCategory(cat)) issues.push({ label: `unknown category “${cat}”`, severity: "error" });

  if (!(g.slug ?? "").trim()) issues.push({ label: "missing slug", severity: "error" });

  if (!(g.description ?? "").trim()) issues.push({ label: "no description", severity: "warn" });

  const w = Number(g.width);
  const h = Number(g.height);
  if (!w || !h || w <= 0 || h <= 0) issues.push({ label: "missing dimensions", severity: "warn" });

  const thumb = (g.thumbnail_image ?? "").trim().toLowerCase();
  if (thumb && PLACEHOLDER_HINTS.some((p) => thumb.includes(p)))
    issues.push({ label: "placeholder thumbnail", severity: "warn" });

  return issues;
}

/* Cross-row check: two different games sharing a slug collide on the public
 * site (one route, two games). Returns the set of slugs used more than once. */
export function findDuplicateSlugs(rows: { slug: string | null }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = (r.slug ?? "").trim();
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [slug, n] of counts) if (n > 1) dupes.add(slug);
  return dupes;
}
