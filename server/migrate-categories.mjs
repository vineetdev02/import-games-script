/* One-off migration: remap existing `games` rows to canonical categories.
 *
 * Re-runs every row's stored `category` (+ `tags`) through the same
 * resolveCategory() used by the live importer, so games imported before
 * the category-mapping fix land on one of web0.2's 10 valid slugs instead
 * of being orphaned. Also mirrors `main_category = category` (web0.2
 * ignores main_category, but we keep the column consistent).
 *
 * SAFE BY DEFAULT — dry run. Nothing is written unless you pass --apply.
 *
 *   node migrate-categories.mjs            # preview only
 *   node migrate-categories.mjs --apply    # actually update Supabase
 *
 * Credentials come from server/.env (same as the server).
 */

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCategory, DEFAULT_CATEGORY, isValidCategory } from "./lib/categories.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPLY = process.argv.includes("--apply");
const UPDATE_BATCH = 200;

/* --- env loading (mirrors server.mjs) --- */
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
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[migrate] Missing SUPABASE_URL / SUPABASE_KEY in server/.env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* --- fetch all rows in pages (Supabase caps a select at 1000) --- */
async function fetchAllRows() {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("games")
      .select("id, category, main_category, tags")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  console.log(`[migrate] mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  const rows = await fetchAllRows();
  console.log(`[migrate] fetched ${rows.length} rows`);

  /* Decide the target slug for each row. A row needs an update if its
   * category isn't already the canonical slug, or main_category drifts. */
  const transitions = new Map(); // "from -> to" : count
  const byTarget = new Map(); // targetSlug : [ids]
  let unchanged = 0;

  for (const row of rows) {
    const current = (row.category ?? "").toLowerCase().trim();
    const target = resolveCategory(row.category, row.tags, DEFAULT_CATEGORY);
    const mainOk = row.main_category === target;

    if (current === target && mainOk) {
      unchanged++;
      continue;
    }

    const key = `${row.category ?? "(null)"} -> ${target}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(row.id);
  }

  const toChange = [...byTarget.values()].reduce((n, ids) => n + ids.length, 0);

  console.log(`\n[migrate] ${unchanged} rows already canonical, ${toChange} need updating`);
  console.log(`[migrate] transition breakdown (current category -> new slug):`);
  for (const [k, v] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
    const orphaned = !isValidCategory(k.split(" -> ")[0].toLowerCase().trim());
    console.log(`   ${String(v).padStart(6)}  ${k}${orphaned ? "   (was orphaned)" : ""}`);
  }

  if (!APPLY) {
    console.log(`\n[migrate] DRY RUN — re-run with --apply to write these changes.`);
    return;
  }

  console.log(`\n[migrate] applying updates…`);
  let done = 0;
  for (const [target, ids] of byTarget.entries()) {
    for (const batch of chunk(ids, UPDATE_BATCH)) {
      const { error } = await supabase
        .from("games")
        .update({ category: target, main_category: target })
        .in("id", batch);
      if (error) throw new Error(`update to "${target}" failed: ${error.message}`);
      done += batch.length;
      process.stdout.write(`\r[migrate] updated ${done}/${toChange}`);
    }
  }
  console.log(`\n[migrate] done — ${done} rows updated.`);
  console.log(`[migrate] NOTE: trigger a web0.2 revalidate (or wait for the 1h cache) to see changes live.`);
}

main().catch((err) => {
  console.error(`\n[migrate] FATAL: ${err.message}`);
  process.exit(1);
});
