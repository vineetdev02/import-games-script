/* Best-effort hint to the web app: "hey, catalog changed, drop
 * your caches." Reads REVALIDATE_URL + REVALIDATE_SECRET from env.
 * If either is missing, this is a no-op so local dev imports keep
 * working without web0.2 running. Never throws — caller wraps in
 * .catch(() => {}). */

const DEFAULT_TIMEOUT_MS = 5_000;
let warnedMissing = false;

export async function notifyRevalidate(body = {}) {
  const url = process.env.REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        "[revalidate] REVALIDATE_URL or REVALIDATE_SECRET not set — skipping cache bust",
      );
    }
    return { ok: false, reason: "not-configured" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[revalidate] ${res.status} ${res.statusText}`);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`[revalidate] request failed: ${err?.message || err}`);
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
