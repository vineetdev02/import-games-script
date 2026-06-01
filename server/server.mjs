/* import-games-script server
 *
 * Browser UI lives in ../index.html. This server:
 *   - serves the static UI on /
 *   - normalizes provider JSON
 *   - duplicate-checks against Supabase (parameterized queries)
 *   - runs batched, concurrent upserts with progress streamed via SSE
 *   - persists import state so a crashed browser tab can resume
 *
 * Supabase credentials NEVER leave this process. The browser never
 * sees the key. Set them in server/.env (gitignored).
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalize, PROVIDERS } from "./lib/normalize.mjs";
import { CATEGORIES, isValidCategory, DEFAULT_CATEGORY } from "./lib/categories.mjs";
import { findDuplicates } from "./lib/duplicates.mjs";
import { createImporter } from "./lib/importer.mjs";
import { loadCheckpoint, deleteCheckpoint, listCheckpoints } from "./lib/checkpoint.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PARENT_DIR = path.resolve(__dirname, "..");

/* --- env loading --- */
async function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}
await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PORT = Number(process.env.PORT) || 5174;
const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE) || 100;
const IMPORT_CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY) || 5;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[server] Missing SUPABASE_URL or SUPABASE_KEY in server/.env. See server/.env.example.");
  console.error("[server] Server will start but Supabase routes will return 500.");
}

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/* --- in-memory registry of running imports keyed by importId --- */
const activeImports = new Map();
let nextImportSeq = 1;

const app = new Hono();
app.use("*", cors({ origin: "*" }));

/* Serve the static UI files from the parent dir with explicit routes
 * and an absolute path resolution so it works regardless of cwd. */
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

async function serveFile(c, relPath) {
  const safe = path.normalize(relPath).replace(/^[/\\]+/, "");
  if (safe.includes("..")) return c.text("Not Found", 404);
  const abs = path.join(PARENT_DIR, safe);
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return c.text("Not Found", 404);
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const type = STATIC_TYPES[ext] || "application/octet-stream";
    return new Response(buf, { headers: { "Content-Type": type } });
  } catch (err) {
    if (err.code === "ENOENT") return c.text("Not Found", 404);
    throw err;
  }
}

app.get("/", (c) => c.redirect("/index.html"));
app.get("/index.html", (c) => serveFile(c, "index.html"));
app.get("/script.js", (c) => serveFile(c, "script.js"));
app.get("/styles.css", (c) => serveFile(c, "styles.css"));
app.get("/preview.html", (c) => serveFile(c, "preview.html"));
app.get("/preview.js", (c) => serveFile(c, "preview.js"));
app.get("/images/:name", (c) => serveFile(c, `images/${c.req.param("name")}`));

/* --- routes --- */

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    supabaseConfigured: !!supabase,
    activeImports: activeImports.size,
    batchSize: IMPORT_BATCH_SIZE,
    concurrency: IMPORT_CONCURRENCY,
  }),
);

app.get("/api/providers", (c) =>
  c.json({ providers: PROVIDERS.map((p) => ({ id: p.id, label: p.label })) }),
);

/* Canonical category taxonomy — the client builds its selectors from this
 * so the import list can never drift from web0.2's category slugs. */
app.get("/api/categories", (c) =>
  c.json({ categories: CATEGORIES, default: DEFAULT_CATEGORY }),
);

app.post("/api/process", async (c) => {
  try {
    const { provider, raw, overrideCategory, forceAll } = await c.req.json();
    if (forceAll && !isValidCategory(overrideCategory)) {
      return c.json(
        { error: `forceAll requires a valid overrideCategory (one of the canonical slugs)` },
        400,
      );
    }
    const result = normalize(raw, provider || "auto", {
      overrideCategory: isValidCategory(overrideCategory) ? overrideCategory : undefined,
      forceAll: !!forceAll,
    });
    return c.json({
      count: result.games.length,
      provider: result.providerId,
      providerLabel: result.providerLabel,
      detected: result.detected,
      games: result.games,
    });
  } catch (err) {
    return c.json({ error: err.message || String(err) }, 400);
  }
});

app.post("/api/check-duplicates", async (c) => {
  if (!supabase) return c.json({ error: "Supabase not configured" }, 500);
  try {
    const { games } = await c.req.json();
    if (!Array.isArray(games)) return c.json({ error: "games must be an array" }, 400);
    const duplicates = await findDuplicates(supabase, games);
    return c.json({ count: duplicates.length, duplicates });
  } catch (err) {
    return c.json({ error: err.message || String(err) }, 500);
  }
});

app.post("/api/filter", async (c) => {
  /* Filter games by quality and image-health BEFORE submit.
   * Inputs: { games, minQuality, requireThumbnail } */
  const { games, minQuality, requireThumbnail } = await c.req.json();
  if (!Array.isArray(games)) return c.json({ error: "games must be an array" }, 400);
  const filtered = games.filter((g) => {
    if (typeof minQuality === "number" && (g.quality_score ?? 0) < minQuality) return false;
    if (requireThumbnail && !g.thumbnail_image) return false;
    return true;
  });
  return c.json({ count: filtered.length, games: filtered });
});

app.post("/api/import/start", async (c) => {
  if (!supabase) return c.json({ error: "Supabase not configured" }, 500);
  try {
    const { games } = await c.req.json();
    if (!Array.isArray(games) || !games.length) {
      return c.json({ error: "games array is required" }, 400);
    }

    const importId = `${Date.now()}-${nextImportSeq++}`;
    const importer = createImporter({
      supabase,
      batchSize: IMPORT_BATCH_SIZE,
      concurrency: IMPORT_CONCURRENCY,
    });
    activeImports.set(importId, importer);

    /* Fire-and-forget. Progress is read via SSE. */
    importer.run({ importId, games }).catch((err) => {
      console.error(`[import ${importId}] fatal:`, err);
    });

    return c.json({ importId, total: games.length });
  } catch (err) {
    return c.json({ error: err.message || String(err) }, 500);
  }
});

app.get("/api/import/:id/progress", async (c) => {
  const importId = c.req.param("id");
  const importer = activeImports.get(importId);
  if (!importer) {
    /* If it's not active but checkpoint exists, return final snapshot once and close. */
    const cp = await loadCheckpoint(importId);
    if (cp) {
      return c.json({ final: true, snapshot: cp });
    }
    return c.json({ error: "Unknown import id" }, 404);
  }

  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const write = (event, data) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        write("snapshot", importer.snapshot());
        const onProgress = (snap) => write("progress", snap);
        const onError = (info) => write("batch_error", info);
        const onDone = (final) => {
          write("done", final);
          controller.close();
        };
        importer.events.on("progress", onProgress);
        importer.events.on("batch_error", onError);
        importer.events.once("done", onDone);
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    },
  );
});

app.post("/api/import/:id/cancel", (c) => {
  const importId = c.req.param("id");
  const importer = activeImports.get(importId);
  if (!importer) return c.json({ error: "Unknown import id" }, 404);
  importer.cancel();
  return c.json({ ok: true });
});

app.get("/api/import/:id/failed", async (c) => {
  const importId = c.req.param("id");
  const importer = activeImports.get(importId);
  let failedGames = [];
  if (importer) {
    failedGames = importer.snapshot().failedGames;
  } else {
    const cp = await loadCheckpoint(importId);
    if (cp) failedGames = cp.failedGames || [];
  }
  return new Response(JSON.stringify(failedGames, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="failed-${importId}.json"`,
    },
  });
});

app.get("/api/imports", async (c) => {
  const ids = await listCheckpoints();
  return c.json({ checkpoints: ids });
});

app.delete("/api/imports/:id", async (c) => {
  const importId = c.req.param("id");
  await deleteCheckpoint(importId);
  activeImports.delete(importId);
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
  console.log(`[server] UI: http://localhost:${info.port}/index.html`);
  console.log(`[server] Supabase: ${supabase ? "configured" : "NOT configured (set server/.env)"}`);
});
