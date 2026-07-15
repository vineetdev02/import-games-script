import { NextResponse, type NextRequest } from "next/server";
import { getSupabase, GAMES_TABLE } from "@/lib/supabase";
import { runLiveCheck } from "@/lib/live-check";

export const maxDuration = 300;

/* Live-site check: DB slugs vs what actiongames.io actually serves.
 * POST { deep?: boolean } — deep probes every game URL instead of a sample. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deep = body.deep === true;

    const sb = getSupabase();

    /* PostgREST caps each response at 1000 rows — page through so the check
     * covers the whole catalog. */
    const PAGE = 1000;
    const slugs: string[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from(GAMES_TABLE)
        .select("slug")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const chunk = (data ?? []) as { slug: string | null }[];
      slugs.push(...chunk.map((r) => (r.slug ?? "").trim()).filter(Boolean));
      if (chunk.length < PAGE) break;
    }

    const report = await runLiveCheck(slugs, { deep });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
