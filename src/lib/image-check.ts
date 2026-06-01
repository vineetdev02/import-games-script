import "server-only";

/* Validate that an image URL actually resolves to an image. Used to flag
 * games with missing / empty / 404 / broken thumbnails or banners. */

export type ImgStatus = "ok" | "missing" | "broken";

const TIMEOUT_MS = 8000;

async function probe(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    /* Try HEAD first (cheap). Some CDNs reject HEAD → fall back to a ranged GET. */
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: ctrl.signal,
        redirect: "follow",
      });
    }
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    /* Accept image/* — some hosts omit content-type on HEAD, allow empty. */
    return ct === "" || ct.startsWith("image/");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkImageUrl(url: string | null | undefined): Promise<ImgStatus> {
  if (!url || !url.trim()) return "missing";
  const ok = await probe(url.trim());
  return ok ? "ok" : "broken";
}

export interface GameImageReport {
  thumbnail: ImgStatus;
  banner: ImgStatus; // "missing" is normal/allowed for banners
  /* A game is "problem" if its thumbnail is missing/broken, or it has a
   * banner URL set that is broken (an absent banner is fine). */
  problem: boolean;
  reasons: string[];
}

export async function checkGameImages(game: {
  thumbnail_image: string | null;
  banner_image: string | null;
  is_banner?: boolean | null;
}): Promise<GameImageReport> {
  const [thumbnail, banner] = await Promise.all([
    checkImageUrl(game.thumbnail_image),
    game.banner_image && game.banner_image.trim()
      ? checkImageUrl(game.banner_image)
      : Promise.resolve<ImgStatus>("missing"),
  ]);

  const reasons: string[] = [];
  if (thumbnail === "missing") reasons.push("no thumbnail");
  if (thumbnail === "broken") reasons.push("thumbnail 404/broken");
  if (banner === "broken") reasons.push("banner 404/broken");
  /* If a game is flagged as a banner game but has no banner image, that's a problem too. */
  if (game.is_banner && banner === "missing") reasons.push("banner game with no banner image");

  const problem =
    thumbnail === "missing" ||
    thumbnail === "broken" ||
    banner === "broken" ||
    (!!game.is_banner && banner === "missing");

  return { thumbnail, banner, problem, reasons };
}

/* Run checks with a concurrency cap so we don't open hundreds of sockets. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
