import "server-only";
import type { NormalizedGame, GameRow } from "@/types/game";

/* Cross-provider dedup. The original importer only deduped on
 * (provider, provider_game_id), so the SAME game pulled from GamePix and
 * GameMonetize would import twice. Here we also key on a normalized title
 * and the play URL, so a game is considered a duplicate regardless of which
 * provider it came from. */

/* Normalize a title into a comparison key: lowercase, drop HTML/punct,
 * strip common filler words and trailing version/number noise. */
const FILLER = new Set([
  "the", "a", "an", "game", "games", "play", "free", "online", "html5",
  "html", "2d", "3d", "io", "web", "now", "new",
]);

export function titleKey(title: string): string {
  const words = (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
  return words.join(" ");
}

export function urlKey(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    /* host + path, ignore query/trailing slash — same embed = same game */
    return (u.host + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export interface BatchDedupResult {
  unique: NormalizedGame[];
  removed: NormalizedGame[]; // intra-file duplicates
}

/* Remove duplicates WITHIN the incoming file. Keeps the higher
 * quality_score when two rows collide (else the first seen). */
export function dedupeBatch(games: NormalizedGame[]): BatchDedupResult {
  const seen = new Map<string, number>(); // key -> index in unique[]
  const unique: NormalizedGame[] = [];
  const removed: NormalizedGame[] = [];

  for (const g of games) {
    const keys = [titleKey(g.title), urlKey(g.play_url)].filter(Boolean);
    const hitKey = keys.find((k) => seen.has(k));
    if (hitKey !== undefined) {
      const idx = seen.get(hitKey)!;
      const kept = unique[idx];
      if ((g.quality_score ?? 0) > (kept?.quality_score ?? 0)) {
        removed.push(kept);
        unique[idx] = g;
        for (const k of [titleKey(kept.title), urlKey(kept.play_url)]) if (k) seen.delete(k);
        for (const k of keys) seen.set(k, idx);
      } else {
        removed.push(g);
      }
      continue;
    }
    const idx = unique.length;
    unique.push(g);
    for (const k of keys) seen.set(k, idx);
  }
  return { unique, removed };
}

export interface ExistingKeySet {
  titleKeys: Set<string>;
  urlKeys: Set<string>;
  providerIds: Set<string>; // `${provider}::${provider_game_id}`
}

export function buildExistingKeys(rows: Partial<GameRow>[]): ExistingKeySet {
  const titleKeys = new Set<string>();
  const urlKeys = new Set<string>();
  const providerIds = new Set<string>();
  for (const r of rows) {
    if (r.title) titleKeys.add(titleKey(r.title));
    if (r.play_url) urlKeys.add(urlKey(r.play_url));
    if (r.provider && r.provider_game_id)
      providerIds.add(`${r.provider}::${r.provider_game_id}`);
  }
  return { titleKeys, urlKeys, providerIds };
}

export interface DbDedupResult {
  fresh: NormalizedGame[];
  duplicates: NormalizedGame[]; // already in DB (any provider)
}

/* Partition a (already intra-deduped) batch against existing DB rows. */
export function partitionAgainstExisting(
  games: NormalizedGame[],
  existing: ExistingKeySet,
): DbDedupResult {
  const fresh: NormalizedGame[] = [];
  const duplicates: NormalizedGame[] = [];
  for (const g of games) {
    const dup =
      existing.providerIds.has(`${g.provider}::${g.provider_game_id}`) ||
      existing.titleKeys.has(titleKey(g.title)) ||
      (urlKey(g.play_url) && existing.urlKeys.has(urlKey(g.play_url)));
    if (dup) duplicates.push(g);
    else fresh.push(g);
  }
  return { fresh, duplicates };
}
