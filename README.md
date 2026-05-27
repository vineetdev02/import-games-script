# Game Data Importer (v2)

Tool to import HTML5 games from GameMonetize and GamePix into Supabase. Browser UI for visual review + edit. Node backend for the actual upserts.

## Why v2

v1 ran entirely in the browser with the Supabase key pasted into an HTML input. That meant:
- The key shipped to anyone who hit the page
- A `service_role` key got committed to git history (now rotated)
- 1000-game imports took 10+ minutes and crashed tabs

v2 puts credentials on a local Node server. The browser never sees the key. Imports are batched + concurrent + resumable.

## Architecture

```
[Browser UI] ─────fetch + SSE─────> [Node server :5174] ──────> [Supabase REST]
   index.html                          server/server.mjs            games table
   script.js
   styles.css
```

The browser never touches Supabase directly. The Node server reads `server/.env` for credentials and proxies all DB operations.

## Setup

1. **Set credentials:**
   ```bash
   cd server
   cp .env.example .env
   # Edit .env with your Supabase URL + ANON key (not service_role!)
   ```

2. **Install + start the server:**
   ```bash
   cd server
   npm install
   npm start
   ```

3. **Open the UI:**
   - http://localhost:5174/index.html

If you see "Server connected, Supabase configured ✓" at the top of the page, you're good.

## Usage

1. Pick a provider (GameMonetize or GamePix).
2. Pick a main category (Featured Games, New Releases, etc.).
3. Choose a JSON file from a provider dump.
4. Click **Import Data**. The server normalizes the file and returns the games for review.
5. (Optional) **Filters**: set a min quality score or require a thumbnail URL, then click **Apply Filters** to trim the list.
6. Edit any field on any game card. The play preview iframe is lazy-loaded — click "▶ Preview game" only when you want to test a specific game.
7. (Optional) Click **Check Duplicates** to query Supabase and surface games that already exist.
8. Click **Submit All** when ready. Confirmation modal appears.
9. Click **Confirm Upload**. Progress streams live via Server-Sent Events.
10. When done, if there are failures, click **Download failed games (JSON)** to get the offending records as a file you can fix and re-import.

## What's new vs v1

| Feature | v1 | v2 |
|---|---|---|
| Credentials | In HTML input, localStorage | Server-side `.env`, never in browser |
| Import speed (1000 games) | ~10 min, sequential | ~30 sec, batched + 5 concurrent |
| Resume after crash | None | Server checkpoint per import |
| Failed games | Scroll the results table | One-click JSON download |
| Duplicate query | Vulnerable string interpolation | Parameterized `.in()` per provider |
| Entity decoding | Partial (`&amp;`, `&lt;`, `&gt;`) | Full (curly quotes, em/en dashes, `mdash`/`ndash` artifacts) |
| Slug collisions | First-write wins | Appends `provider_game_id` |
| `play_count` on update | Zeroed out (bug) | Preserved |
| `is_new` flag | Always true | Derived from `date_published` (30-day window) for GamePix |
| Iframe preview | 20 per page, eager | Lazy, click to load |
| Filters | None | min quality, require thumbnail |

## Supabase prerequisites

The `games` table needs a unique index on `(provider, provider_game_id)` so the upsert can use it as the conflict key:

```sql
create unique index if not exists games_provider_game_id_idx
  on games (provider, provider_game_id);
```

Required columns (same as v1):
`id`, `provider`, `provider_game_id`, `title`, `description`, `instructions`, `slug`, `category`, `main_category`, `tags`, `orientation`, `quality_score`, `width`, `height`, `date_modified`, `date_published`, `banner_image`, `thumbnail_image`, `play_url`, `play_count`, `is_featured`, `is_new`, `created_at`, `updated_at`.

## Provider formats

### GameMonetize
Array of objects. Each object:
```json
{
  "id": "12345",
  "title": "Game Title",
  "description": "Game description text",
  "instructions": "How to play",
  "url": "https://html5.gamemonetize.com/.../",
  "category": "Action",
  "tags": "Tag1, Tag2",
  "thumb": "https://...",
  "width": "800",
  "height": "600"
}
```

### GamePix
```json
{
  "items": [
    {
      "id": "ABC123",
      "title": "...",
      "namespace": "url-slug",
      "description": "...",
      "category": "action",
      "orientation": "landscape",
      "quality_score": 0.92,
      "width": 800,
      "height": 600,
      "date_modified": "...",
      "date_published": "...",
      "banner_image": "...",
      "image": "...",
      "url": "..."
    }
  ]
}
```

## Security notes

- **Never paste a `service_role` key.** Use the ANON key + Row Level Security on the `games` table. The ANON key alone, with the right RLS rules, is enough for inserts from an authenticated admin user.
- The `.gitignore` in this folder excludes `server/.env`, `server/node_modules`, and `server/state/`. Keep them gitignored.
- If you ever need to operate the server in a CI environment, supply env vars via the runner's secret store rather than committing `.env`.

## Troubleshooting

- **"Server unreachable"**: Start the server: `cd server && npm start`. Confirm it logs `listening on http://localhost:5174`.
- **"Supabase NOT configured"**: Edit `server/.env`. Restart the server.
- **Import stalls at 0%**: Confirm the `(provider, provider_game_id)` unique index exists in Supabase. Without it, the upsert can't resolve conflicts and Supabase rejects the batch.
- **Browser doesn't refresh after an import**: SSE connection may have dropped. Refresh the page. Active import keeps running on the server; you can re-subscribe by passing the same `importId` to `/api/import/:id/progress`.
- **Want to resume a crashed import**: Look in `server/state/` for `import-*.json` files. Each file is a snapshot of one import session.

## File layout

```
import-games-script/
├── .gitignore
├── README.md
├── index.html                  Browser UI
├── script.js                   Frontend logic (calls /api/*)
├── styles.css
├── gamemonitize-*.json         Sample / source dumps
├── gamepix-*.json
├── server/
│   ├── .env.example            Copy to .env
│   ├── .env                    [gitignored] your real credentials
│   ├── package.json
│   ├── server.mjs              Hono server
│   ├── lib/
│   │   ├── normalize.mjs       Provider → row shape
│   │   ├── duplicates.mjs      Safe dup check
│   │   ├── importer.mjs        Batched upsert + concurrency
│   │   └── checkpoint.mjs      Per-import state on disk
│   └── state/                  [gitignored] import-*.json checkpoints
```
