-- Adds the banner-games flag. Run once in the Supabase SQL editor.
-- A banner game keeps its real category AND shows in the banner slot,
-- so this is an orthogonal boolean (like is_featured), not a category.
alter table games add column if not exists is_banner boolean default false;

-- Optional: index for fast "banner games" filtering.
create index if not exists games_is_banner_idx on games (is_banner) where is_banner = true;
