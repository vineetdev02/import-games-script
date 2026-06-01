import "server-only";
import { getSupabase, GAMES_TABLE } from "./supabase";
import { hasBannerColumn } from "./schema";
import { getCategorySlugs } from "./categories";
import type { GameRow, NormalizedGame } from "@/types/game";

export type SortKey = "newest" | "oldest" | "popular" | "rating" | "az" | "za";
export type FlagFilter = "all" | "featured" | "banner" | "new" | "broken";

export interface ListParams {
  q?: string;
  category?: string;
  flag?: FlagFilter;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ListResult {
  rows: GameRow[];
  total: number;
  page: number;
  pageSize: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function applySort(query: any, sort: SortKey) {
  switch (sort) {
    case "oldest": return query.order("created_at", { ascending: true, nullsFirst: true });
    case "popular": return query.order("play_count", { ascending: false, nullsFirst: false });
    case "rating": return query.order("quality_score", { ascending: false, nullsFirst: false });
    case "az": return query.order("title", { ascending: true });
    case "za": return query.order("title", { ascending: false });
    case "newest":
    default: return query.order("created_at", { ascending: false, nullsFirst: false });
  }
}

export async function listGames(params: ListParams): Promise<ListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25));
  const banner = await hasBannerColumn();

  let query = getSupabase().from(GAMES_TABLE).select("*", { count: "exact" });

  if (params.q && params.q.trim()) {
    query = query.ilike("title", `%${params.q.trim()}%`);
  }
  if (params.category && params.category !== "all") {
    query = query.eq("category", params.category);
  }
  switch (params.flag) {
    case "featured": query = query.eq("is_featured", true); break;
    case "new": query = query.eq("is_new", true); break;
    case "banner": query = banner ? query.eq("is_banner", true) : query.eq("id", "__none__"); break;
    /* "broken" is computed live elsewhere; ignore here */
    default: break;
  }

  query = applySort(query, params.sort ?? "newest");
  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as GameRow[], total: count ?? 0, page, pageSize };
}

export interface Stats {
  total: number;
  featured: number;
  banner: number | null; // null = column not present yet
  isNew: number;
  perCategory: { slug: string; count: number }[];
  uncategorized: number; // rows whose category isn't one of the canonical slugs
}

export async function getStats(): Promise<Stats> {
  const sb = getSupabase();
  const banner = await hasBannerColumn();
  const slugs = getCategorySlugs();
  const headCount = () => sb.from(GAMES_TABLE).select("id", { count: "exact", head: true });

  /* Fire every count query in parallel — sequential round-trips to a
   * remote Supabase made this take ~7s; parallel brings it under 1s. */
  const [totalR, featuredR, isNewR, bannerR, ...catRs] = await Promise.all([
    headCount(),
    headCount().eq("is_featured", true),
    headCount().eq("is_new", true),
    banner ? headCount().eq("is_banner", true) : Promise.resolve({ count: null }),
    ...slugs.map((slug) => headCount().eq("category", slug)),
  ]);

  const total = totalR.count ?? 0;
  const perCategory = slugs.map((slug, i) => ({ slug, count: catRs[i]?.count ?? 0 }));
  const inCanonical = perCategory.reduce((n, c) => n + c.count, 0);

  return {
    total,
    featured: featuredR.count ?? 0,
    banner: banner ? (bannerR.count ?? 0) : null,
    isNew: isNewR.count ?? 0,
    perCategory,
    uncategorized: Math.max(0, total - inCanonical),
  };
}

/* Strip is_banner from a payload when the column doesn't exist yet. */
async function sanitizeWrite<T extends Record<string, unknown>>(row: T): Promise<T> {
  if (await hasBannerColumn()) return row;
  const { is_banner, ...rest } = row as Record<string, unknown>;
  void is_banner;
  return rest as T;
}

export async function updateGame(id: string, patch: Partial<GameRow>): Promise<GameRow> {
  const clean = await sanitizeWrite({ ...patch, updated_at: new Date().toISOString() } as Record<string, unknown>);
  const { data, error } = await getSupabase()
    .from(GAMES_TABLE)
    .update(clean)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as GameRow;
}

export async function deleteGames(ids: (string | number)[]): Promise<number> {
  if (!ids.length) return 0;
  const { error, count } = await getSupabase()
    .from(GAMES_TABLE)
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteByCategory(slug: string): Promise<number> {
  const { error, count } = await getSupabase()
    .from(GAMES_TABLE)
    .delete({ count: "exact" })
    .eq("category", slug);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface InsertReport {
  inserted: number;
  failed: number;
  errors: string[];
}

export async function upsertGames(rows: NormalizedGame[]): Promise<InsertReport> {
  if (!rows.length) return { inserted: 0, failed: 0, errors: [] };
  const banner = await hasBannerColumn();
  const payload = rows.map((r) => {
    const base: Record<string, unknown> = { ...r, play_count: 0 };
    if (!banner) delete base.is_banner;
    return base;
  });

  const BATCH = 100;
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < payload.length; i += BATCH) {
    const batch = payload.slice(i, i + BATCH);
    const { error, count } = await getSupabase()
      .from(GAMES_TABLE)
      .upsert(batch, { onConflict: "provider,provider_game_id", count: "exact", ignoreDuplicates: false });
    if (error) {
      failed += batch.length;
      errors.push(error.message);
    } else {
      inserted += count ?? batch.length;
    }
  }
  return { inserted, failed, errors };
}

/* Keys for cross-provider dedup — small projection over the whole table. */
export async function fetchExistingKeys(): Promise<Partial<GameRow>[]> {
  const sb = getSupabase();
  const PAGE = 1000;
  const rows: Partial<GameRow>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(GAMES_TABLE)
      .select("title, play_url, provider, provider_game_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    rows.push(...(data as Partial<GameRow>[]));
    if (data.length < PAGE) break;
  }
  return rows;
}
