import { NextResponse, type NextRequest } from "next/server";
import { updateGame, deleteGames } from "@/lib/games";
import { getSupabase, GAMES_TABLE } from "@/lib/supabase";
import { resolveCategory } from "@/lib/category-map";
import { isValidCategory, DEFAULT_CATEGORY } from "@/lib/categories";
import type { GameRow } from "@/types/game";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getSupabase().from(GAMES_TABLE).select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ game: data });
}

const EDITABLE: (keyof GameRow)[] = [
  "title", "description", "instructions", "slug", "category", "main_category",
  "tags", "orientation", "quality_score", "width", "height", "banner_image",
  "thumbnail_image", "play_url", "is_featured", "is_new", "is_banner", "play_count",
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const patch: Partial<GameRow> = {};
    for (const key of EDITABLE) {
      if (key in body) (patch as Record<string, unknown>)[key] = body[key];
    }
    /* Keep category canonical and mirror main_category. */
    if (patch.category !== undefined) {
      const cat = isValidCategory(patch.category)
        ? (patch.category as string)
        : resolveCategory(patch.category as string, patch.tags ?? "", DEFAULT_CATEGORY);
      patch.category = cat;
      patch.main_category = cat;
    }
    const updated = await updateGame(id, patch);
    return NextResponse.json({ ok: true, game: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const count = await deleteGames([id]);
    return NextResponse.json({ ok: true, deleted: count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
