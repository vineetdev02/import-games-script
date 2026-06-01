import { NextResponse, type NextRequest } from "next/server";

/* Fetch a provider feed URL server-side so the browser doesn't hit CORS.
 * Providers like GamePix hand out a JSON RSS-feed URL rather than a file. */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "A valid http(s) URL is required" }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Feed returned ${res.status} ${res.statusText}` }, { status: 400 });
    }

    const text = await res.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Feed response was not valid JSON" }, { status: 400 });
    }

    return NextResponse.json({ raw });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
