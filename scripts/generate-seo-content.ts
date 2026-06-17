/**
 * generate-seo-content.ts — bulk backfill of unique, grounded SEO copy for
 * every game. Shares its generation logic with the admin "Generate with AI"
 * button via src/lib/seo-generate.ts (one prompt, one model, no drift).
 *
 * Why: providers give a short description + raw instructions and nothing else,
 * so buildGameFaq() emits the same boilerplate on all ~600 pages. Google reads
 * that as thin/duplicate content and parks the pages in "Crawled - currently
 * not indexed". This writes a unique about + FAQ per game, GROUNDED in that
 * game's real data so it's accurate, not hallucinated.
 *
 * Safe + resumable: only fills rows where seo_about IS NULL (unless --force),
 * one row failing never aborts the run, and the web app falls back to the old
 * template for any game without generated content.
 *
 * Prereqs (admin-dashboard/.env.local):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_KEY=...      # full write access (local admin only)
 *   OPENROUTER_API_KEY=...        # free key from openrouter.ai
 * Run the 002 migration first, then:
 *   npm i -D tsx     # if not already present
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/generate-seo-content.ts --dry-run --limit 3
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/generate-seo-content.ts
 *
 * Flags: --limit N | --force | --dry-run | --concurrency N | --model <id>
 */

import { createClient } from "@supabase/supabase-js";
import { generateSeoContent, getModels } from "../src/lib/seo-generate";

type GameRow = {
  id: string | number;
  title: string;
  description: string | null;
  instructions: string | null;
  category: string | null;
  tags: string | null;
  seo_about: string | null;
};

/* ── args ─────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const val = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const DRY_RUN = flag("dry-run");
const FORCE = flag("force");
const LIMIT = Number(val("limit", "0")) || 0; // 0 = no limit
/* Free models are rate-limited (~20/min) — keep concurrency modest. */
const CONCURRENCY = Math.max(1, Number(val("concurrency", "3")) || 3);
/* --model "id1,id2" overrides the whole fallback chain. */
if (args.includes("--model")) process.env.SEO_MODELS = val("model", "");

/* ── supabase ─────────────────────────────────────────────────────── */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (see .env.local).");
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY (free key from openrouter.ai — add to .env.local).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ── main ─────────────────────────────────────────────────────────── */
async function main() {
  let query = supabase
    .from("games")
    .select("id, title, description, instructions, category, tags, seo_about")
    .order("play_count", { ascending: false });
  if (!FORCE) query = query.is("seo_about", null);
  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) {
    console.error("Supabase read failed:", error.message);
    process.exit(1);
  }
  const games = (data || []) as GameRow[];
  console.log(
    `Free-model chain: ${getModels().length} models | concurrency: ${CONCURRENCY} | dry-run: ${DRY_RUN} | force: ${FORCE}`,
  );
  console.log(`${games.length} game(s) to process.\n`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < games.length; i += CONCURRENCY) {
    const batch = games.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (g) => {
        try {
          const content = await generateSeoContent(g);
          if (!DRY_RUN) {
            const { error: upErr } = await supabase
              .from("games")
              .update({ seo_about: content.about, seo_faq: content.faq })
              .eq("id", g.id);
            if (upErr) throw new Error(`update: ${upErr.message}`);
          }
          done++;
          console.log(
            `✓ ${g.title}  (${content.faq.length} FAQ via ${content.model})${DRY_RUN ? "  [dry-run]" : ""}`,
          );
          if (DRY_RUN) console.log(`   ${content.about.slice(0, 120)}…\n`);
        } catch (err) {
          failed++;
          console.warn(`✗ ${g.title}: ${(err as Error).message}`);
        }
      }),
    );
    console.log(`   …${Math.min(i + CONCURRENCY, games.length)}/${games.length}`);
  }

  console.log(`\nDone. ${done} generated, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
