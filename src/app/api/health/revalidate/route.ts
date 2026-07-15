import { NextResponse } from "next/server";

export const maxDuration = 60;

/* Busts the live site's caches so the DB and the public site line up again.
 * This is what the CLI scripts already do after an import; the dashboard UI
 * had no equivalent, which is why UI-added games could sit invisible for up
 * to an hour (and stay out of the sitemap indefinitely). */

const REVALIDATE_URL = process.env.REVALIDATE_URL ?? "https://actiongames.io/api/revalidate";

async function bust(secret: string, body: unknown): Promise<string[]> {
  const res = await fetch(REVALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    bustedPaths?: string[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error || `revalidate failed (${res.status})`);
  return json.bustedPaths ?? [];
}

export async function POST() {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "REVALIDATE_SECRET not set in admin-dashboard/.env.local" },
      { status: 500 },
    );

  try {
    /* Two calls on purpose. An empty body busts the catalog tag + the three
     * page templates, but the web's default path list historically skipped the
     * sitemap, and passing `paths` replaces that list rather than adding to it.
     * The explicit second call refreshes the sitemap on deployments that
     * predate the fix, and is a harmless no-op on newer ones. */
    const busted = [
      ...(await bust(secret, {})),
      ...(await bust(secret, { paths: ["/sitemap.xml"] })),
    ];

    return NextResponse.json({
      ok: true,
      bustedPaths: [...new Set(busted)],
      revalidatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
