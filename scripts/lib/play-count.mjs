/*
 * play-count.mjs — single source of truth for the cosmetic play-count value.
 *
 * There is no real play tracking yet, so every game needs a believable
 * "plays" number for social proof. We want a realistic, skewed spread:
 * MOST games sit in the low thousands–tens of thousands, a handful reach
 * the hundreds of thousands, and only a rare few hit the millions — just
 * like a real game portal where a couple of hits carry the catalog.
 *
 * Used by both backfill-play-counts.mjs (existing rows) and add-game.mjs
 * (new rows on insert) so the distribution stays consistent everywhere.
 */

const MIN = 1_500;
const MAX = 3_000_000;
const SKEW = 2.2; // >1 pushes the mass toward MIN; higher = more low values

/* Log-scaled across [MIN, MAX] with a power-curve bias toward the low end.
 * Median lands around ~8k; ~top 1% reach the millions. Tidied to the
 * nearest 100 so the raw stored number reads cleanly. */
export function randomPlayCount() {
  const u = Math.random() ** SKEW; // 0..1, biased small
  const raw = MIN * Math.pow(MAX / MIN, u); // MIN at u=0, MAX at u=1
  return Math.round(raw / 100) * 100;
}

export const PLAY_COUNT_RANGE = { MIN, MAX };
