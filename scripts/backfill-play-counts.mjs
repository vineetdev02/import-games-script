#!/usr/bin/env node
/*
 * backfill-play-counts.mjs — give every game a believable play count.
 *
 * Finds every row where play_count is NULL or 0 and writes a realistic,
 * skewed random value (see lib/play-count.mjs). Rows that already have a
 * positive play_count are NEVER touched, so the script is safe to re-run
 * and counts stay stable once assigned.
 *
 * After a successful write it busts the live site's catalog cache so the
 * new numbers show up immediately.
 *
 * Usage:
 *   node scripts/backfill-play-counts.mjs              # do it
 *   node scripts/backfill-play-counts.mjs --dry-run    # preview + histogram, no writes
 *
 * Flags:
 *   --dry-run        count targets + print a sample distribution, write nothing
 *   --no-revalidate  don't bust the live cache afterward
 *   --quiet          only print the final summary
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomPlayCount, PLAY_COUNT_RANGE } from "./lib/play-count.mjs";

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

const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ------------------------------- fetch targets -------------------------------- */
/* Every row with no real count yet: play_count IS NULL OR play_count = 0. */
async function fetchTargets() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(GAMES_TABLE)
      .select("id, title")
      .or("play_count.is.null,play_count.eq.0")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/* ----------------------------- distribution preview --------------------------- */
function histogram(values) {
  const buckets = [
    ["1.5k–10k", (v) => v < 10_000],
    ["10k–50k", (v) => v < 50_000],
    ["50k–250k", (v) => v < 250_000],
    ["250k–1M", (v) => v < 1_000_000],
    ["1M–3M", () => true],
  ];
  const counts = buckets.map(() => 0);
  for (const v of values) {
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i][1](v)) { counts[i]++; break; }
    }
  }
  const total = values.length || 1;
  log(`${C.bold}  sample spread (${values.length} generated):${C.reset}`);
  buckets.forEach(([label], i) => {
    const pct = Math.round((counts[i] / total) * 100);
    const bar = "█".repeat(Math.round(pct / 2));
    log(`    ${label.padEnd(10)} ${String(pct).padStart(3)}%  ${C.dim}${bar}${C.reset} ${counts[i]}`);
  });
}

/* -------------------------------- write loop ---------------------------------- */
async function backfill(rows) {
  let done = 0, failed = 0;
  const CONCURRENCY = 25;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const r = rows[cursor++];
      const value = randomPlayCount();
      const { error } = await supabase
        .from(GAMES_TABLE)
        .update({ play_count: value })
        .eq("id", r.id);
      if (error) { failed++; console.error(`  ${C.red}✗ id=${r.id}: ${error.message}${C.reset}`); }
      else { done++; }
      if (!QUIET && done % 100 === 0) log(`  ${C.dim}...${done}/${rows.length}${C.reset}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return { done, failed };
}

/* ------------------------------ cache revalidation ---------------------------- */
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
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("backfill-play-counts.mjs — assign believable play counts to rows where play_count is 0/null.\n  Flags: --dry-run  --no-revalidate  --quiet");
    return;
  }
  const dryRun = argv.includes("--dry-run");
  const revalidate = !argv.includes("--no-revalidate");
  if (argv.includes("--quiet")) QUIET = true;

  log(`${C.bold}backfill-play-counts${C.reset} ${C.dim}— range ${PLAY_COUNT_RANGE.MIN.toLocaleString()}–${PLAY_COUNT_RANGE.MAX.toLocaleString()}${dryRun ? " (dry run)" : ""}${C.reset}\n`);

  const targets = await fetchTargets();
  log(`${C.cyan}${targets.length}${C.reset} game(s) with play_count = 0 / null\n`);
  if (targets.length === 0) { ok("nothing to backfill — every game already has a count"); return; }

  if (dryRun) {
    const sample = targets.map(() => randomPlayCount());
    histogram(sample);
    log(`\n${C.dim}[dry run] would update ${targets.length} rows — nothing written${C.reset}`);
    return;
  }

  const { done, failed } = await backfill(targets);
  const parts = [`${C.green}${done} updated${C.reset}`];
  if (failed) parts.push(`${C.red}${failed} failed${C.reset}`);
  console.log(`\n${parts.join(", ")}`);

  if (revalidate && done > 0) {
    log("");
    await revalidateSite();
  }
  if (failed) process.exit(1);
}

main().catch((e) => die(e.message || String(e)));
