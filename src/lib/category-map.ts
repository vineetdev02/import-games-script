import "server-only";
import { getCategorySlugs, DEFAULT_CATEGORY } from "./categories";

/* Maps messy provider categories + tags onto the canonical site slugs.
 * Mirrors import-games-script/server/lib/categories.mjs. Keep in sync. */
const SYNONYMS: Record<string, string> = {
  // puzzles
  puzzle: "puzzles", puzzles: "puzzles", "match 3": "puzzles", match3: "puzzles",
  "match-3": "puzzles", "bubble shooter": "puzzles", bubble: "puzzles", bejeweled: "puzzles",
  mahjong: "puzzles", block: "puzzles", blocks: "puzzles", brain: "puzzles", logic: "puzzles",
  jigsaw: "puzzles", word: "puzzles", words: "puzzles", quiz: "puzzles", trivia: "puzzles",
  sudoku: "puzzles", connect: "puzzles", sort: "puzzles", merge: "puzzles",
  "hidden objects": "puzzles", difference: "puzzles", "spot the difference": "puzzles",
  board: "puzzles", card: "puzzles", cards: "puzzles", solitaire: "puzzles", memory: "puzzles",
  educational: "puzzles", education: "puzzles", coloring: "puzzles",
  // hypercasual
  hypercasual: "hypercasual", "hyper casual": "hypercasual", "hyper-casual": "hypercasual",
  casual: "hypercasual", agility: "hypercasual", skill: "hypercasual", tap: "hypercasual",
  relaxing: "hypercasual", runner: "hypercasual", running: "hypercasual", jumping: "hypercasual",
  // adventure
  adventure: "adventure", rpg: "adventure", "role playing": "adventure", quest: "adventure",
  platform: "adventure", platformer: "adventure", exploration: "adventure", escape: "adventure",
  "point and click": "adventure", story: "adventure", dungeon: "adventure",
  survival: "adventure", "open world": "adventure",
  // shooting
  shooting: "shooting", shooter: "shooting", shoot: "shooting", fps: "shooting", gun: "shooting",
  guns: "shooting", sniper: "shooting", war: "shooting", army: "shooting", military: "shooting",
  zombie: "shooting", tank: "shooting", defense: "shooting", "tower defense": "shooting",
  // racing
  racing: "racing", race: "racing", driving: "racing", drive: "racing", car: "racing",
  cars: "racing", bike: "racing", bikes: "racing", motorcycle: "racing", truck: "racing",
  drift: "racing", speed: "racing", parking: "racing", traffic: "racing",
  // sports
  sports: "sports", sport: "sports", soccer: "sports", football: "sports", basketball: "sports",
  baseball: "sports", golf: "sports", tennis: "sports", pool: "sports", billiards: "sports",
  bowling: "sports", fishing: "sports", boxing: "sports", cricket: "sports", hockey: "sports",
  skateboard: "sports",
  // action
  action: "action", ".io": "action", io: "action", fighting: "action", fight: "action",
  ninja: "action", superhero: "action", stickman: "action", multiplayer: "action",
  "2 player": "action", "2-player": "action", "two player": "action",
  "battle royale": "action", battle: "action",
  // arcade
  arcade: "arcade", retro: "arcade", classic: "arcade", pinball: "arcade", snake: "arcade",
  flappy: "arcade", endless: "arcade",
  // clicker
  clicker: "clicker", click: "clicker", idle: "clicker", incremental: "clicker",
  tycoon: "clicker", simulator: "clicker", simulation: "clicker", management: "clicker",
  business: "clicker", farm: "clicker",
  // girls
  girls: "girls", girl: "girls", "dress up": "girls", dressup: "girls", "dress-up": "girls",
  makeover: "girls", fashion: "girls", cooking: "girls", cook: "girls", makeup: "girls",
  beauty: "girls", hair: "girls", salon: "girls", baby: "girls", princess: "girls",
  wedding: "girls", doll: "girls",
};

function lookup(token: string | null | undefined): string | null {
  if (!token) return null;
  const slugs = getCategorySlugs();
  const k = token.toLowerCase().trim();
  if (slugs.includes(k)) return k;
  if (SYNONYMS[k]) return SYNONYMS[k];
  const stripped = k.replace(/[.\s]+$/g, "");
  if (slugs.includes(stripped)) return stripped;
  if (SYNONYMS[stripped]) return SYNONYMS[stripped];
  return null;
}

export function resolveCategory(
  rawCategory: string | null | undefined,
  tags: string[] | string = [],
  fallback: string = DEFAULT_CATEGORY,
): string {
  const direct = lookup(rawCategory);
  if (direct) return direct;
  const tagList = Array.isArray(tags) ? tags : String(tags || "").split(",");
  for (const t of tagList) {
    const hit = lookup(t);
    if (hit) return hit;
  }
  return fallback;
}
