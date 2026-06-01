import { NextResponse, type NextRequest } from "next/server";
import { normalize, type ProviderId } from "@/lib/normalize";
import { dedupeBatch, partitionAgainstExisting, buildExistingKeys } from "@/lib/dedup";
import { fetchExistingKeys } from "@/lib/games";
import { isValidCategory } from "@/lib/categories";

/* Normalize an uploaded provider JSON, then run cross-provider dedup:
 *   1. within the file, and
 *   2. against everything already in the DB (any provider).
 * Returns the fresh games + a breakdown so the UI can preview before commit. */
export async function POST(req: NextRequest) {
  try {
    const { provider, raw, overrideCategory, forceAll } = await req.json();
    const opts = {
      overrideCategory: isValidCategory(overrideCategory) ? overrideCategory : undefined,
      forceAll: !!forceAll,
    };
    const norm = normalize(raw, (provider as ProviderId) || "auto", opts);

    const { unique, removed } = dedupeBatch(norm.games);
    const existing = buildExistingKeys(await fetchExistingKeys());
    const { fresh, duplicates } = partitionAgainstExisting(unique, existing);

    return NextResponse.json({
      provider: norm.provider,
      detected: norm.detected,
      counts: {
        total: norm.games.length,
        duplicatesInFile: removed.length,
        duplicatesInDb: duplicates.length,
        fresh: fresh.length,
      },
      fresh,
      duplicatesInDb: duplicates.map((g) => ({ title: g.title, provider: g.provider })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
