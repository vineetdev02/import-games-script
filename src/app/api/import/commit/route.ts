import { NextResponse, type NextRequest } from "next/server";
import { upsertGames } from "@/lib/games";
import type { NormalizedGame } from "@/types/game";

export async function POST(req: NextRequest) {
  try {
    const { games } = await req.json();
    if (!Array.isArray(games) || !games.length) {
      return NextResponse.json({ error: "games[] is required" }, { status: 400 });
    }
    const report = await upsertGames(games as NormalizedGame[]);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
