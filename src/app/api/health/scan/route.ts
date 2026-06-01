import { NextResponse, type NextRequest } from "next/server";
import { getSupabase, GAMES_TABLE } from "@/lib/supabase";
import { hasBannerColumn } from "@/lib/schema";
import { checkGameImages, mapWithConcurrency } from "@/lib/image-check";
import type { GameRow } from "@/types/game";

export const maxDuration = 120;

/* Scan games for missing / broken (404) thumbnail or banner images.
 * Returns ONLY the problem games. Optionally restrict to specific ids. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: (string | number)[] | undefined = Array.isArray(body.ids) ? body.ids : undefined;
    const banner = await hasBannerColumn();
    const cols = `id, title, slug, category, thumbnail_image, banner_image${banner ? ", is_banner" : ""}`;

    const sb = getSupabase();
    let query = sb.from(GAMES_TABLE).select(cols);
    if (ids?.length) query = query.in("id", ids);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const games = (data ?? []) as unknown as GameRow[];
    const reports = await mapWithConcurrency(games, 24, async (g) => {
      const r = await checkGameImages({
        thumbnail_image: g.thumbnail_image,
        banner_image: g.banner_image,
        is_banner: g.is_banner,
      });
      return { game: g, report: r };
    });

    const problems = reports
      .filter((x) => x.report.problem)
      .map((x) => ({
        id: x.game.id,
        title: x.game.title,
        slug: x.game.slug,
        category: x.game.category,
        thumbnail_image: x.game.thumbnail_image,
        banner_image: x.game.banner_image,
        is_banner: x.game.is_banner ?? false,
        thumbnail: x.report.thumbnail,
        banner: x.report.banner,
        reasons: x.report.reasons,
      }));

    return NextResponse.json({ scanned: games.length, problems });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
