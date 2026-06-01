# ActionGames Admin Dashboard

Local-only admin dashboard for the actiongames.io Supabase catalog. Manage games,
banners, and image health. Black theme, shadcn/ui + Tailwind 4, Next.js 16.

> **Local use only.** This app uses the Supabase **service-role key** (full write
> access). Never deploy it or expose it to the internet.

## Run

```bash
npm install            # first time only
PORT=5180 npm run dev  # http://localhost:5180
```

Open the URL, enter the password from `.env.local` (`ADMIN_PASSWORD`, default `admin`).

## One-time DB migration (for banner games)

Banner games need an `is_banner` column. The dashboard works without it, but the
banner toggle is disabled until you run this in the Supabase SQL editor:

```sql
alter table games add column if not exists is_banner boolean default false;
```

See `migrations/001_add_is_banner.sql`. After running it, hit **Refresh** on the
Overview page.

## Features

- **Overview** — counts (total, featured, banner, new, per-category), migration prompt.
- **Games** — search, filter (category / featured / banner / new), sort, paginate.
  Per-row **play** (in-dashboard iframe), **edit** (all fields), **delete**.
  Bulk delete selected, and delete-all-in-category.
- **Add Games**
  - *JSON Import* — auto-detect provider (GameMonetize / GamePix), map categories to
    the canonical site slugs, and **cross-provider dedup**: a game already in the DB
    (under any provider) is detected by normalized title + play URL and skipped.
    Preview fresh vs duplicate counts before committing.
  - *Manual Add* — full form incl. banner image + is_banner.
- **Needs Attention** — scans every game's thumbnail + banner for missing/404/broken
  images and lists only the problems, with bulk smart-remove.
- **Categories** — the canonical 10 (mirrored from web0.2), counts, manage/delete per
  category.

## Config

`.env.local`:

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | service-role key (write access) |
| `ADMIN_PASSWORD` | password gate for the dashboard |
| `WEB02_CATEGORIES_PATH` | path to web0.2's `categories.json` (source of truth) |

## Source of truth

Categories are **read from `../web0.2/public/data/categories.json`** — the same list
the live site uses. The dashboard never keeps its own copy, so the two can't drift.

## Architecture

- `src/lib/` — server-only data layer: `supabase` (service client), `games` (CRUD +
  stats), `normalize` + `category-map` (provider import), `dedup` (cross-provider),
  `image-check` (404 detection), `categories` (source-of-truth reader), `schema`
  (is_banner capability probe).
- `src/app/api/` — route handlers (all mutations server-side).
- `src/proxy.ts` — Next 16 auth gate (renamed from `middleware`).
- `src/components/` — UI (shadcn-style) + feature components.
