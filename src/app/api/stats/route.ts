import { NextResponse } from "next/server";
import { getStats } from "@/lib/games";
import { hasBannerColumn } from "@/lib/schema";

export async function GET() {
  try {
    const [stats, bannerReady] = await Promise.all([getStats(), hasBannerColumn()]);
    return NextResponse.json({ ...stats, bannerColumnReady: bannerReady });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
