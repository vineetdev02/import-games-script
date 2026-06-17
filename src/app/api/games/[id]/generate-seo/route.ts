import { NextResponse, type NextRequest } from "next/server";
import { getSupabase, GAMES_TABLE } from "@/lib/supabase";
import { generateSeoContent } from "@/lib/seo-generate";

/* Generate (but don't persist) unique about + FAQ for one game. The admin
 * reviews the result in EditGameDialog and clicks Save to write it back via
 * the normal PATCH route — same shared generator as the bulk script. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { data, error } = await getSupabase()
      .from(GAMES_TABLE)
      .select("title, description, instructions, category, tags")
      .eq("id", id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    const content = await generateSeoContent(data);
    return NextResponse.json({ ok: true, ...content });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
