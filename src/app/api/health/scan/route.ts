import { NextResponse, type NextRequest } from "next/server";
import { getSupabase, GAMES_TABLE } from "@/lib/supabase";
import { hasBannerColumn } from "@/lib/schema";
import { checkGameImages, mapWithConcurrency } from "@/lib/image-check";
import { validateGameData, findDuplicateSlugs, type Issue } from "@/lib/game-validate";
import type { GameRow } from "@/types/game";

export const maxDuration = 120;

/* Full health scan. Flags a game when EITHER:
 *   • an image is missing / broken (404 thumbnail or banner), or
 *   • a data field is missing / invalid (title, play URL, category, slug,
 *     dimensions, description), or
 *   • its slug collides with another game's slug.
 * Returns ONLY problem games, errors before warnings. Optionally restrict
 * to specific ids. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: (string | number)[] | undefined = Array.isArray(body.ids) ? body.ids : undefined;
    const banner = await hasBannerColumn();
    const cols = `id, title, slug, category, description, play_url, width, height, thumbnail_image, banner_image${banner ? ", is_banner" : ""}`;

    const sb = getSupabase();

    /* PostgREST caps each response at 1000 rows — page through so the scan
     * covers the WHOLE catalog, not just the first 1000 games. */
    const PAGE = 1000;
    const games: GameRow[] = [];
    if (ids?.length) {
      const { data, error } = await sb.from(GAMES_TABLE).select(cols).in("id", ids);
      if (error) throw new Error(error.message);
      games.push(...((data ?? []) as unknown as GameRow[]));
    } else {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from(GAMES_TABLE)
          .select(cols)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const chunk = (data ?? []) as unknown as GameRow[];
        games.push(...chunk);
        if (chunk.length < PAGE) break;
      }
    }

    /* Slug collisions are a cross-row property — compute once up front. */
    const dupeSlugs = findDuplicateSlugs(games);

    const reports = await mapWithConcurrency(games, 24, async (g) => {
      const img = await checkGameImages({
        thumbnail_image: g.thumbnail_image,
        banner_image: g.banner_image,
        is_banner: g.is_banner,
      });

      const issues: Issue[] = validateGameData(g);
      /* Image problems are always errors. */
      for (const reason of img.reasons) issues.push({ label: reason, severity: "error" });
      if ((g.slug ?? "").trim() && dupeSlugs.has((g.slug ?? "").trim()))
        issues.push({ label: "duplicate slug", severity: "error" });

      return { game: g, img, issues };
    });

    const problems = reports
      .filter((x) => x.issues.length > 0)
      .map((x) => ({
        id: x.game.id,
        title: x.game.title,
        slug: x.game.slug,
        category: x.game.category,
        thumbnail_image: x.game.thumbnail_image,
        banner_image: x.game.banner_image,
        is_banner: x.game.is_banner ?? false,
        thumbnail: x.img.thumbnail,
        banner: x.img.banner,
        /* errors first, then warnings — most urgent on top */
        issues: x.issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1)),
      }))
      /* Surface games with errors above games that only have warnings. */
      .sort((a, b) => {
        const ae = a.issues.some((i) => i.severity === "error") ? 0 : 1;
        const be = b.issues.some((i) => i.severity === "error") ? 0 : 1;
        return ae - be;
      });

    const errorCount = problems.filter((p) => p.issues.some((i) => i.severity === "error")).length;
    const warnCount = problems.length - errorCount;

    return NextResponse.json({ scanned: games.length, problems, errorCount, warnCount });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
