import { NextResponse, type NextRequest } from "next/server";
import { deleteGames, deleteByCategory } from "@/lib/games";

export async function POST(req: NextRequest) {
  try {
    const { ids, category } = await req.json();
    let deleted = 0;
    if (Array.isArray(ids) && ids.length) {
      deleted = await deleteGames(ids);
    } else if (category) {
      deleted = await deleteByCategory(category);
    } else {
      return NextResponse.json({ error: "Provide ids[] or category" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
