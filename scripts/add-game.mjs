#!/usr/bin/env node
/*
 * add-game.mjs — store a game in Supabase from data extracted off a provider page.
 *
 * Workflow: you (or Claude) read a GamePix / GameMonetize screenshot, pull out the
 * fields, and hand them to this script as JSON. The script does the boring, error-prone
 * part robustly: derive provider + namespace + thumbnail + slug, map the messy provider
 * category onto our 10 canonical slugs, decode HTML entities, VERIFY the cover image and
 * play URL actually resolve, dedupe against everything already in the DB, then upsert.
 *
 * Minimum you must supply: `title` and `play_url`. Everything else is auto-filled and
 * can be overridden. Mirrors the logic in src/lib/{normalize,category-map,dedup}.ts so a
 * game added here is identical to one added through the dashboard.
 *
 * Usage:
 *   node scripts/add-game.mjs --json '{"title":"Commando Force 2","play_url":"https://play.gamepix.com/commando-force-2/embed?sid=NG7M4", ...}'
 *   node scripts/add-game.mjs --file game.json          # object OR array of objects
 *   echo '{...}' | node scripts/add-game.mjs            # piped stdin
 *
 * Flags:
 *   --dry-run        normalize + validate + dedupe, print the row, but DON'T write
 *   --force          insert even if it looks like a duplicate of an existing game
 *   --no-verify      skip the network probe of thumbnail / play_url (faster, less safe)
 *   --no-revalidate  don't bust the live site's catalog cache after a successful import
 *   --quiet          only print the final one-line summary
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomPlayCount } from "./lib/play-count.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, ".."); // admin-dashboard/
const GAMES_TABLE = "games";

/* ----------------------------- tiny pretty logger ----------------------------- */
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m",
};
let QUIET = false;
const log = (...a) => { if (!QUIET) console.log(...a); };
const ok = (m) => log(`${C.green}✓${C.reset} ${m}`);
const warn = (m) => log(`${C.yellow}!${C.reset} ${m}`);
const die = (m) => { console.error(`${C.red}✗ ${m}${C.reset}`); process.exit(1); };

/* --------------------------------- env loading -------------------------------- */
function loadEnv() {
  const out = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      const txt = readFileSync(path.join(APP_ROOT, file), "utf-8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in out && process.env[m[1]])) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* file optional */ }
  }
  return out;
}
const ENV = loadEnv();
if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_KEY) {
  die("SUPABASE_URL / SUPABASE_SERVICE_KEY missing — set them in admin-dashboard/.env.local");
}

/* ------------------------------ canonical categories -------------------------- */
const FALLBACK_CATS = ["puzzles","hypercasual","adventure","shooting","racing","sports","action","arcade","clicker","girls"];
const DEFAULT_CATEGORY = "action";
function getCategorySlugs() {
  const rel = ENV.WEB02_CATEGORIES_PATH ?? "../web0.2/public/data/categories.json";
  for (const candidate of [rel, "../web/public/data/categories.json"]) {
    try {
      const abs = path.resolve(APP_ROOT, candidate);
      const parsed = JSON.parse(readFileSync(abs, "utf-8"));
      if (Array.isArray(parsed) && parsed.length) return parsed.map((c) => c.slug);
    } catch { /* try next */ }
  }
  return FALLBACK_CATS;
}
const SLUGS = getCategorySlugs();
const isValidCategory = (s) => !!s && SLUGS.includes(s);

/* Mirror of src/lib/category-map.ts SYNONYMS. Keep in sync. */
const SYNONYMS = {
  puzzle:"puzzles",puzzles:"puzzles","match 3":"puzzles",match3:"puzzles","match-3":"puzzles","bubble shooter":"puzzles",bubble:"puzzles",bejeweled:"puzzles",mahjong:"puzzles",block:"puzzles",blocks:"puzzles",brain:"puzzles",logic:"puzzles",jigsaw:"puzzles",word:"puzzles",words:"puzzles",quiz:"puzzles",trivia:"puzzles",sudoku:"puzzles",connect:"puzzles",sort:"puzzles",merge:"puzzles","hidden objects":"puzzles",difference:"puzzles","spot the difference":"puzzles",board:"puzzles",card:"puzzles",cards:"puzzles",solitaire:"puzzles",memory:"puzzles",educational:"puzzles",education:"puzzles",coloring:"puzzles",
  hypercasual:"hypercasual","hyper casual":"hypercasual","hyper-casual":"hypercasual",casual:"hypercasual",agility:"hypercasual",skill:"hypercasual",tap:"hypercasual",relaxing:"hypercasual",runner:"hypercasual",running:"hypercasual",jumping:"hypercasual",
  adventure:"adventure",rpg:"adventure","role playing":"adventure",quest:"adventure",platform:"adventure",platformer:"adventure",exploration:"adventure",escape:"adventure","point and click":"adventure",story:"adventure",dungeon:"adventure",survival:"adventure","open world":"adventure",
  shooting:"shooting",shooter:"shooting",shoot:"shooting",fps:"shooting","first person shooter":"shooting","first-person shooter":"shooting",gun:"shooting",guns:"shooting",sniper:"shooting",war:"shooting",army:"shooting",military:"shooting",zombie:"shooting",tank:"shooting",defense:"shooting","tower defense":"shooting",
  racing:"racing",race:"racing",driving:"racing",drive:"racing",car:"racing",cars:"racing",bike:"racing",bikes:"racing",motorcycle:"racing",truck:"racing",drift:"racing",speed:"racing",parking:"racing",traffic:"racing",
  sports:"sports",sport:"sports",soccer:"sports",football:"sports",basketball:"sports",baseball:"sports",golf:"sports",tennis:"sports",pool:"sports",billiards:"sports",bowling:"sports",fishing:"sports",boxing:"sports",cricket:"sports",hockey:"sports",skateboard:"sports",
  action:"action",".io":"action",io:"action",fighting:"action",fight:"action",ninja:"action",superhero:"action",stickman:"action",multiplayer:"action","2 player":"action","2-player":"action","two player":"action","battle royale":"action",battle:"action",
  arcade:"arcade",retro:"arcade",classic:"arcade",pinball:"arcade",snake:"arcade",flappy:"arcade",endless:"arcade",
  clicker:"clicker",click:"clicker",idle:"clicker",incremental:"clicker",tycoon:"clicker",simulator:"clicker",simulation:"clicker",management:"clicker",business:"clicker",farm:"clicker",
  girls:"girls",girl:"girls","dress up":"girls",dressup:"girls","dress-up":"girls",makeover:"girls",fashion:"girls",cooking:"girls",cook:"girls",makeup:"girls",beauty:"girls",hair:"girls",salon:"girls",baby:"girls",princess:"girls",wedding:"girls",doll:"girls",
};
function catLookup(token) {
  if (!token) return null;
  const k = String(token).toLowerCase().trim();
  if (SLUGS.includes(k)) return k;
  if (SYNONYMS[k]) return SYNONYMS[k];
  const stripped = k.replace(/[.\s]+$/g, "");
  if (SLUGS.includes(stripped)) return stripped;
  if (SYNONYMS[stripped]) return SYNONYMS[stripped];
  return null;
}
function resolveCategory(rawCategory, tags = [], fallback = DEFAULT_CATEGORY) {
  const direct = catLookup(rawCategory);
  if (direct) return direct;
  const list = Array.isArray(tags) ? tags : String(tags || "").split(",");
  for (const t of list) { const hit = catLookup(t); if (hit) return hit; }
  return fallback;
}

/* ----------------------------- text helpers (normalize.ts) -------------------- */
const ENTITY = [
  [/&amp;mdash;|&mdash;/g,"—"],[/&amp;ndash;|&ndash;/g,"–"],[/\bmdash\b/g,"—"],[/\bndash\b/g,"–"],
  [/&amp;quot;|&quot;/g,'"'],[/&amp;#39;|&#39;|&amp;apos;|&apos;/g,"'"],[/&amp;nbsp;|&nbsp;/g," "],
  [/&amp;hellip;|&hellip;/g,"…"],[/&amp;lt;|&lt;/g,"<"],[/&amp;gt;|&gt;/g,">"],[/&amp;|&AMP;/g,"&"],
];
function cleanText(input) {
  if (input == null) return "";
  let out = String(input);
  for (const [re, rep] of ENTITY) out = out.replace(re, rep);
  return out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function slugify(input) {
  return cleanText(input).toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
}

/* ----------------------------- dedup keys (dedup.ts) -------------------------- */
const FILLER = new Set(["the","a","an","game","games","play","free","online","html5","html","2d","3d","io","web","now","new"]);
function titleKey(title) {
  return (title || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w && !FILLER.has(w)).join(" ");
}
function urlKey(url) {
  if (!url) return "";
  try { const u = new URL(url); return (u.host + u.pathname).replace(/\/+$/, "").toLowerCase(); }
  catch { return String(url).trim().toLowerCase(); }
}

/* --------------------------- provider auto-detection -------------------------- */
/* Returns { provider, providerGameId, thumbnail } derived from the play URL. */
function deriveFromPlayUrl(playUrl) {
  let host = "", segs = [];
  try { const u = new URL(playUrl); host = u.host.toLowerCase(); segs = u.pathname.split("/").filter(Boolean); }
  catch { return { provider: "manual", providerGameId: "", thumbnail: "" }; }

  if (host.includes("gamepix.com")) {
    const ns = segs[0] || ""; // .../commando-force-2/embed?sid=...
    return {
      provider: "gamepix",
      providerGameId: ns,
      thumbnail: ns ? `https://img.gamepix.com/games/${ns}/cover/${ns}.png?w=600` : "",
    };
  }
  if (host.includes("gamemonetize")) {
    const ns = segs[0] || ""; // html5.gamemonetize.co/<hash>/
    return {
      provider: "gamemonitize", // DB spelling (sic) — matches existing 600+ rows
      providerGameId: ns,
      thumbnail: ns ? `https://img.gamemonetize.com/${ns}/512x384.jpg` : "",
    };
  }
  return { provider: "manual", providerGameId: "", thumbnail: "" };
}

function orientationOf(w, h, given) {
  if (given === "portrait" || given === "landscape") return given;
  const ww = Number(w), hh = Number(h);
  if (!ww || !hh) return "landscape";
  return ww >= hh ? "landscape" : "portrait";
}
function parseDate(raw) {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/* --------------------------------- normalize ---------------------------------- */
function normalizeGame(input) {
  const title = cleanText(input.title);
  const playUrl = String(input.play_url || "").trim();
  if (!title) throw new Error("`title` is required");
  if (!playUrl) throw new Error("`play_url` is required");
  if (!/^https?:\/\//i.test(playUrl)) throw new Error(`play_url must be an http(s) URL: "${playUrl}"`);

  const d = deriveFromPlayUrl(playUrl);
  const provider = cleanText(input.provider) || d.provider;
  const providerGameId = String(input.provider_game_id || d.providerGameId || `manual-${Date.now()}`);

  const tags = cleanText(input.tags);
  const tagList = tags.toLowerCase().split(",").map((t) => t.trim()).filter(Boolean);
  const category = isValidCategory(input.category)
    ? input.category
    : resolveCategory(input.category, tagList, DEFAULT_CATEGORY);

  const slugBase = input.slug ? slugify(input.slug)
    : (provider === "gamepix" && d.providerGameId) ? d.providerGameId
    : `${slugify(title) || "game"}-${providerGameId}`;

  const width = Number(input.width) || 800;
  const height = Number(input.height) || 600;
  const orientation = orientationOf(width, height, input.orientation);

  const datePublished = parseDate(input.date_published) || new Date().toISOString();
  const dateModified = parseDate(input.date_modified) || datePublished;

  // rating (0–5 stars) → quality_score (0–1) if quality_score not given directly
  let quality = input.quality_score != null && input.quality_score !== "" ? Number(input.quality_score) : null;
  if (quality == null && input.rating != null && input.rating !== "") quality = Math.max(0, Math.min(1, Number(input.rating) / 5));

  const thumb = String(input.thumbnail_image || d.thumbnail || "").trim();
  const isNew = input.is_new != null ? !!input.is_new
    : (Date.now() - new Date(datePublished).getTime() < NEW_WINDOW_MS);

  return {
    provider_game_id: providerGameId,
    title,
    description: cleanText(input.description),
    instructions: cleanText(input.instructions) || null,
    slug: slugBase || `game-${providerGameId}`,
    category,
    main_category: category,
    tags,
    orientation,
    quality_score: quality,
    width,
    height,
    date_modified: dateModified,
    date_published: datePublished,
    banner_image: String(input.banner_image || "").trim() || null,
    thumbnail_image: thumb,
    play_url: playUrl,
    provider,
    is_featured: !!input.is_featured,
    is_new: isNew,
    is_banner: !!input.is_banner,
  };
}

/* --------------------------------- validation --------------------------------- */
function validate(g) {
  const errors = [], warnings = [];
  if (!g.title) errors.push("missing title");
  else if (g.title.toLowerCase() === "untitled") errors.push("placeholder title");
  if (!g.play_url || !/^https?:\/\//i.test(g.play_url)) errors.push("invalid play_url");
  if (!isValidCategory(g.category)) errors.push(`unknown category "${g.category}"`);
  if (!g.slug) errors.push("missing slug");
  if (!g.thumbnail_image) warnings.push("no thumbnail image");
  if (!g.description) warnings.push("no description");
  if (!g.width || !g.height) warnings.push("missing dimensions");
  return { errors, warnings };
}

/* ---------------------------------- network ----------------------------------- */
async function probe(url, expectImage) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    if ([403, 405, 501].includes(res.status))
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return { ok: false, info: `HTTP ${res.status}` };
    if (expectImage) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct && !ct.startsWith("image/")) return { ok: false, info: `not an image (${ct})` };
    }
    return { ok: true, info: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, info: e.name === "AbortError" ? "timeout" : String(e.message || e) };
  } finally { clearTimeout(timer); }
}

/* --------------------------------- supabase ----------------------------------- */
const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let BANNER_COL = null;
async function hasBannerColumn() {
  if (BANNER_COL !== null) return BANNER_COL;
  const { error } = await supabase.from(GAMES_TABLE).select("is_banner").limit(1);
  BANNER_COL = !error;
  return BANNER_COL;
}
async function fetchExistingKeys() {
  const titleKeys = new Set(), urlKeys = new Set(), providerIds = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(GAMES_TABLE)
      .select("title, play_url, provider, provider_game_id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      if (r.title) titleKeys.add(titleKey(r.title));
      if (r.play_url) urlKeys.add(urlKey(r.play_url));
      if (r.provider && r.provider_game_id) providerIds.add(`${r.provider}::${r.provider_game_id}`);
    }
    if (data.length < PAGE) break;
  }
  return { titleKeys, urlKeys, providerIds };
}
function isDuplicate(g, keys) {
  return keys.providerIds.has(`${g.provider}::${g.provider_game_id}`)
    || keys.titleKeys.has(titleKey(g.title))
    || (urlKey(g.play_url) && keys.urlKeys.has(urlKey(g.play_url)));
}
async function upsertOne(g) {
  const banner = await hasBannerColumn();
  // Seed a believable cosmetic play count on insert (same distribution as the
  // backfill script) so new games never render a dead-looking "0 plays".
  const row = { ...g, play_count: randomPlayCount() };
  if (!banner) delete row.is_banner;
  const { error } = await supabase.from(GAMES_TABLE)
    .upsert(row, { onConflict: "provider,provider_game_id", ignoreDuplicates: false });
  if (error) throw new Error(error.message);
}

/* ----------------------------------- input ------------------------------------ */
function parseArgs(argv) {
  const flags = { dryRun: false, force: false, verify: true, revalidate: true };
  let jsonStr = null, file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--force") flags.force = true;
    else if (a === "--no-verify") flags.verify = false;
    else if (a === "--no-revalidate") flags.revalidate = false;
    else if (a === "--quiet") QUIET = true;
    else if (a === "--json") jsonStr = argv[++i];
    else if (a === "--file") file = argv[++i];
    else if (a.startsWith("--json=")) jsonStr = a.slice(7);
    else if (a.startsWith("--file=")) file = a.slice(7);
  }
  return { flags, jsonStr, file };
}
async function readStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf-8").trim();
  return s || null;
}
async function loadInput({ jsonStr, file }) {
  let raw = jsonStr;
  if (!raw && file) raw = readFileSync(path.resolve(process.cwd(), file), "utf-8");
  if (!raw) raw = await readStdin();
  if (!raw) die("No input. Pass --json '{...}', --file game.json, or pipe JSON via stdin. Use --help for the schema.");
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { die(`Input is not valid JSON: ${e.message}`); }
  return Array.isArray(parsed) ? parsed : [parsed];
}

const HELP = `add-game.mjs — store a game in Supabase from extracted provider data

  node scripts/add-game.mjs --json '<json>'     single object or array
  node scripts/add-game.mjs --file game.json
  echo '<json>' | node scripts/add-game.mjs

Flags: --dry-run  --force  --no-verify  --no-revalidate  --quiet

Input fields (only title + play_url required; rest auto-filled):
  title, play_url            REQUIRED
  description, instructions  free text (HTML entities auto-decoded)
  category                   canonical slug OR raw provider category (auto-mapped)
  tags                       comma-separated (also feeds category mapping)
  thumbnail_image            auto-derived for gamepix/gamemonetize if blank
  banner_image, width, height, orientation
  rating (0-5) | quality_score (0-1), date_published, date_modified
  is_featured, is_new, is_banner, provider, provider_game_id  (all auto/optional)

Canonical categories: ${SLUGS.join(", ")}`;

/* ------------------------------ cache revalidation ---------------------------- */
/* Bust the live site's catalog cache (tag games:all) so freshly imported games
 * show up immediately. Without this, /category/* serves a stale prerender until
 * the 1-hour ISR safety-net expires — which is exactly how a batch of newer
 * games can vanish from the "newest" view. Non-fatal: a failure here never
 * fails the import, since the rows are already safely in Supabase. */
async function revalidateSite() {
  const url = ENV.REVALIDATE_URL || "https://actiongames.io/api/revalidate";
  const secret = ENV.REVALIDATE_SECRET;
  if (!secret) {
    warn("skipping cache revalidation — REVALIDATE_SECRET not set in admin-dashboard/.env.local");
    return;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
      body: "{}",
      signal: ctrl.signal,
    });
    if (res.ok) ok(`live site cache revalidated ${C.dim}(${url})${C.reset}`);
    else warn(`cache revalidation failed: HTTP ${res.status} — site will refresh within 1h on its own`);
  } catch (e) {
    warn(`cache revalidation request failed: ${e.name === "AbortError" ? "timeout" : (e.message || e)} — site will refresh within 1h on its own`);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------ main ------------------------------------ */
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  const { flags, jsonStr, file } = parseArgs(argv);
  const inputs = await loadInput({ jsonStr, file });
  log(`${C.bold}add-game${C.reset} ${C.dim}— ${inputs.length} game(s)${flags.dryRun ? " (dry run)" : ""}${C.reset}\n`);

  const existing = flags.force ? null : await fetchExistingKeys();

  let stored = 0, skipped = 0, failed = 0;
  for (const input of inputs) {
    let g;
    try { g = normalizeGame(input); }
    catch (e) { failed++; console.error(`${C.red}✗ ${e.message}${C.reset}`); continue; }

    log(`${C.cyan}${C.bold}${g.title}${C.reset} ${C.dim}(${g.provider})${C.reset}`);
    log(`  category : ${g.category}    slug: ${g.slug}    ${g.width}×${g.height} ${g.orientation}`);
    log(`  play_url : ${g.play_url}`);
    log(`  thumbnail: ${g.thumbnail_image || C.dim + "(none)" + C.reset}`);

    const { errors, warnings } = validate(g);
    warnings.forEach((w) => warn(`  ${w}`));
    if (errors.length) { failed++; errors.forEach((e) => console.error(`  ${C.red}✗ ${e}${C.reset}`)); log(""); continue; }

    if (flags.verify) {
      const [img, play] = await Promise.all([
        g.thumbnail_image ? probe(g.thumbnail_image, true) : Promise.resolve({ ok: true, info: "skipped" }),
        probe(g.play_url, false),
      ]);
      img.ok ? ok(`  thumbnail resolves (${img.info})`) : warn(`  thumbnail probe failed: ${img.info}`);
      play.ok ? ok(`  play_url resolves (${play.info})`) : warn(`  play_url probe failed: ${play.info}`);
    }

    if (!flags.force && existing && isDuplicate(g, existing)) {
      skipped++; warn(`  duplicate — already in DB (use --force to insert anyway)\n`); continue;
    }

    if (flags.dryRun) { log(`  ${C.dim}dry run — not written${C.reset}\n`); continue; }

    try {
      await upsertOne(g);
      stored++; ok(`  stored in Supabase\n`);
      if (existing) { // keep in-run dedup honest for batches
        existing.providerIds.add(`${g.provider}::${g.provider_game_id}`);
        existing.titleKeys.add(titleKey(g.title));
        if (urlKey(g.play_url)) existing.urlKeys.add(urlKey(g.play_url));
      }
    } catch (e) { failed++; console.error(`  ${C.red}✗ insert failed: ${e.message}${C.reset}\n`); }
  }

  const parts = [`${C.green}${stored} stored${C.reset}`];
  if (skipped) parts.push(`${C.yellow}${skipped} skipped${C.reset}`);
  if (failed) parts.push(`${C.red}${failed} failed${C.reset}`);
  console.log(`${flags.dryRun ? "[dry run] " : ""}${parts.join(", ")}`);

  /* Only bust the cache when we actually wrote something new. */
  if (!flags.dryRun && flags.revalidate && stored > 0) {
    log("");
    await revalidateSite();
  }

  if (failed) process.exit(1);
}

main().catch((e) => die(e.message || String(e)));
