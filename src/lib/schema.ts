import "server-only";
import { getSupabase, GAMES_TABLE } from "./supabase";

/* The is_banner column is added by migrations/001_add_is_banner.sql. The
 * dashboard works before AND after that migration: this cached probe tells
 * the data layer whether to read/write the column. */
let bannerColumnCache: boolean | null = null;

export async function hasBannerColumn(): Promise<boolean> {
  if (bannerColumnCache !== null) return bannerColumnCache;
  try {
    const { error } = await getSupabase().from(GAMES_TABLE).select("is_banner").limit(1);
    bannerColumnCache = !error;
  } catch {
    bannerColumnCache = false;
  }
  return bannerColumnCache;
}

/* Call after the migration is run so a stale "false" doesn't stick. */
export function resetSchemaCache() {
  bannerColumnCache = null;
}
