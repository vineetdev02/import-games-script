import { NextResponse, type NextRequest } from "next/server";
import { listGames, upsertGames, type SortKey, type FlagFilter } from "@/lib/games";
import { resolveCategory } from "@/lib/category-map";
import { slugify, cleanText } from "@/lib/normalize";
import { isValidCategory, DEFAULT_CATEGORY } from "@/lib/categories";
import type { NormalizedGame } from "@/types/game";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const result = await listGames({
      q: sp.get("q") ?? undefined,
      category: sp.get("category") ?? undefined,
      flag: (sp.get("flag") as FlagFilter) ?? undefined,
      sort: (sp.get("sort") as SortKey) ?? undefined,
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 25,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/* Manual add of a single game. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const title = cleanText(b.title);
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!b.play_url) return NextResponse.json({ error: "Play URL is required" }, { status: 400 });

    const category = isValidCategory(b.category)
      ? b.category
      : resolveCategory(b.category, b.tags ?? "", DEFAULT_CATEGORY);

    const id = String(b.provider_game_id || `manual-${Date.now()}`);
    const provider = (b.provider || "manual").trim();

    const game: NormalizedGame = {
      provider_game_id: id,
      title,
      description: cleanText(b.description),
      instructions: cleanText(b.instructions) || null,
      slug: b.slug?.trim() || `${slugify(title) || "game"}-${id}`,
      category,
      main_category: category,
      tags: cleanText(b.tags),
      orientation: b.orientation === "portrait" ? "portrait" : "landscape",
      quality_score: b.quality_score != null && b.quality_score !== "" ? Number(b.quality_score) : null,
      width: Number(b.width) || 800,
      height: Number(b.height) || 600,
      date_modified: new Date().toISOString(),
      date_published: new Date().toISOString(),
      banner_image: b.banner_image?.trim() || null,
      thumbnail_image: b.thumbnail_image?.trim() || "",
      play_url: b.play_url.trim(),
      provider,
      is_featured: !!b.is_featured,
      is_new: b.is_new !== false,
      is_banner: !!b.is_banner,
    };

    const report = await upsertGames([game]);
    if (report.failed) {
      return NextResponse.json({ error: report.errors[0] || "Insert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, game });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
