# ActionGames — Admin Dashboard & Importer

Local-only control panel + import tooling for the actiongames.io Supabase catalog.
Manage games, banners, categories, image health; bulk-import games from providers;
seed SEO content and play counts. Black theme, shadcn/ui + Tailwind 4, Next.js 16.2.6.

- **Repo:** `vineetdev02/import-games-script`
- **Pairs with:** the public site (`vineetdev02/action-games`, the sibling `web/`)

> 🔒 **Local use only.** This app uses the Supabase **service-role key** (full write
> access). Never deploy it or expose it to the internet.

> ⚠️ Customized Next.js build — read `node_modules/next/dist/docs/` before changing
> rendering/caching code. See `AGENTS.md`.

---

## Run

```bash
npm install              # first time only
cp .env.example .env.local   # then fill in the values
npm run dev              # http://localhost:3001
```

Open the URL and enter `ADMIN_PASSWORD` from `.env.local`.

---

## How changes reach the live website

The admin writes to the **same Supabase DB** the live site reads. But the site caches
its catalog (1h `unstable_cache` + ISR), so writes don't appear instantly **unless the
web cache is busted**. Two paths:

| You add/change a game via… | Shows on actiongames.io after… |
|----------------------------|--------------------------------|
| **`scripts/add-game.mjs`** (CLI import) | **Instantly** — it auto-`POST`s the web's `/api/revalidate` after writing |
| **`scripts/backfill-play-counts.mjs`** | **Instantly** — same auto-revalidate |
| **Dashboard UI** (Add Games / edit / delete) | **Up to ~1 hour** — the UI does **not** bust the web cache itself; it waits for the site's revalidate timer, or you press **Revalidate live site** on Health → Live Site |

To force an instant refresh after a UI change, use **Health → Live Site → Revalidate live site**,
or hit the web endpoint manually:

```bash
curl -X POST "$REVALIDATE_URL" -H "x-revalidate-secret: $REVALIDATE_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```

> A "frozen" live site (newest games missing / wrong order) is a **stale web cache**,
> not bad data — the rows are already in Supabase. Revalidate to fix.

### The sitemap is a separate cache entry

`/sitemap.xml` is a cached Route Handler with its **own** ISR entry. Busting the catalog
tag refreshes the data the sitemap reads, but **not** the rendered XML — so a sitemap can
sit frozen at its last deploy while game pages serve fine. `/api/revalidate` now always
busts `/sitemap.xml` too. **Health → Live Site** exists to catch this: it diffs the DB
against the live sitemap and flags games Google can't discover (missing) or will 404 on
(deleted but still listed).

---

## Scripts (CLI tooling)

| Script | Purpose |
|--------|---------|
| `npm run add-game -- --json '{...}'` | Import one/many games from extracted provider data. Auto-detects provider (GameMonetize / GamePix), maps the category to a canonical slug, verifies cover + play URL, **cross-provider dedups**, seeds a play count, upserts, then revalidates the live cache. Flags: `--dry-run --force --no-verify --no-revalidate --quiet`. Accepts `--file` or piped stdin. |
| `node scripts/backfill-play-counts.mjs` | Give every game with `play_count` = 0/null a believable, skewed-random count (never touches positive values). `--dry-run` prints a histogram. Auto-revalidates after writing. |
| `node scripts/generate-seo-content.ts` | Generate per-game `seo_about` + `seo_faq` via OpenRouter free models. |

`scripts/lib/play-count.mjs` is the single source of truth for the play-count
distribution, shared by `add-game` and the backfill so new and existing rows match.

---

## Dashboard features

- **Overview** — counts (total, featured, banner, new, per-category) + migration prompt.
- **Games** — search, filter (category / featured / banner / new), sort, paginate.
  Per-row **play** (in-dashboard iframe), **edit** (all fields), **delete**. Bulk
  delete selected, and delete-all-in-category.
- **Add Games**
  - *JSON Import* — provider auto-detect, canonical category mapping, cross-provider
    dedup (normalized title + play URL), fresh-vs-duplicate preview before commit.
  - *Manual Add* — full form incl. banner image + `is_banner`.
- **Needs Attention** — scans every thumbnail/banner for missing/404/broken images,
  lists only the problems, with bulk smart-remove.
- **Categories** — the canonical 10 (read from the site), counts, manage/delete.

---

## Environment

`.env.local`:

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | service-role key (full write access — keep secret) |
| `ADMIN_PASSWORD` | password gate for the dashboard |
| `WEB02_CATEGORIES_PATH` | path to the site's `categories.json` (defaults to the sibling web app) |
| `REVALIDATE_SECRET` | shared secret for the web's `/api/revalidate` — **must match** `web/.env.local` |
| `REVALIDATE_URL` | the web revalidate endpoint, e.g. `https://actiongames.io/api/revalidate` |
| `SITE_URL` | public site to run live checks against (defaults to `https://actiongames.io`) |

`REVALIDATE_SECRET` / `REVALIDATE_URL` are what let the CLI scripts bust the live
cache. Without them the scripts still write to Supabase but skip revalidation (the
site then refreshes on its own ~1h timer).

---

## One-time DB migration (banner games)

Banner games need an `is_banner` column. The dashboard works without it, but the
banner toggle is disabled until you run (Supabase SQL editor):

```sql
alter table games add column if not exists is_banner boolean default false;
```

See `migrations/001_add_is_banner.sql`; `002_add_seo_content.sql` adds the
`seo_about` / `seo_faq` columns. After running, hit **Refresh** on Overview.

---

## Source of truth

Categories are **read from the sibling site's `categories.json`** (the canonical 10),
so the dashboard and the live site can't drift. Provider categories are normalized
onto these slugs by `src/lib/category-map.ts` (mirrored in `scripts/add-game.mjs` —
keep the two in sync).

## Architecture

```
scripts/
  add-game.mjs              CLI importer (provider → normalize → dedup → upsert → revalidate)
  backfill-play-counts.mjs  one-shot play-count seeding
  generate-seo-content.ts   AI SEO about/FAQ generation
  lib/play-count.mjs        shared play-count distribution
src/
  lib/        server-only: supabase (service client), games (CRUD + stats),
              normalize + category-map (import), dedup, image-check, categories, schema
  app/api/    route handlers (all mutations server-side)
  proxy.ts    Next 16 auth gate (renamed from middleware)
  components/  shadcn-style UI + feature components
migrations/   SQL: is_banner, seo content
```
