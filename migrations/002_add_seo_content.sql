-- 002_add_seo_content.sql
-- Adds AI-generated, editable SEO content to each game.
--
--   seo_about : unique long-form "about this game" prose. When present it
--               replaces the templated description on the game page — this is
--               what fixes the thin/duplicate-content "Crawled - currently not
--               indexed" pages in Search Console.
--   seo_faq   : jsonb array of {question, answer} objects, unique per game.
--               Used for BOTH the visible FAQ and the FAQPage JSON-LD, replacing
--               the boilerplate buildGameFaq() template when present.
--
-- Both columns are nullable. The web app falls back to the existing templated
-- content whenever a column is null, so this migration is safe to run before
-- any content is generated, and games without generated content keep working.

alter table public.games
  add column if not exists seo_about text,
  add column if not exists seo_faq   jsonb;
