/* Canonical category taxonomy — the single source of truth for imports.
 *
 * MUST stay in sync with web0.2/src/config/site.config.ts and
 * web0.2/public/data/categories.json. web0.2 matches a game's `category`
 * field STRICTLY (data.ts: `g.category === slug`, after lowercase+trim),
 * so anything we store that is NOT one of these slugs makes the game
 * appear on NO category page (orphaned). Map every provider category
 * down to one of these slugs at import time.
 */

export const CATEGORIES = [
  { slug: "puzzles", label: "Puzzles" },
  { slug: "hypercasual", label: "Hypercasual" },
  { slug: "adventure", label: "Adventure" },
  { slug: "shooting", label: "Shooting" },
  { slug: "racing", label: "Racing" },
  { slug: "sports", label: "Sports" },
  { slug: "action", label: "Action" },
  { slug: "arcade", label: "Arcade" },
  { slug: "clicker", label: "Clicker" },
  { slug: "girls", label: "Girls" },
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
const SLUG_SET = new Set(CATEGORY_SLUGS);

/* web0.2 uses "action" as its own fallback when category is missing
 * (data.ts: `raw.category ?? "action"`). We match that. */
export const DEFAULT_CATEGORY = "action";

/* Provider category strings + common tags → canonical slug.
 * Keys are lowercase, trimmed. Add freely; first match wins. */
export const CATEGORY_SYNONYMS = {
  /* puzzles */
  puzzle: "puzzles",
  puzzles: "puzzles",
  "match 3": "puzzles",
  match3: "puzzles",
  "match-3": "puzzles",
  "bubble shooter": "puzzles",
  bubble: "puzzles",
  bejeweled: "puzzles",
  mahjong: "puzzles",
  block: "puzzles",
  blocks: "puzzles",
  brain: "puzzles",
  logic: "puzzles",
  jigsaw: "puzzles",
  word: "puzzles",
  words: "puzzles",
  quiz: "puzzles",
  trivia: "puzzles",
  sudoku: "puzzles",
  connect: "puzzles",
  sort: "puzzles",
  merge: "puzzles",
  "hidden objects": "puzzles",
  difference: "puzzles",
  "spot the difference": "puzzles",
  board: "puzzles",
  card: "puzzles",
  cards: "puzzles",
  solitaire: "puzzles",
  memory: "puzzles",
  educational: "puzzles",
  education: "puzzles",
  coloring: "puzzles",

  /* hypercasual */
  hypercasual: "hypercasual",
  "hyper casual": "hypercasual",
  "hyper-casual": "hypercasual",
  casual: "hypercasual",
  agility: "hypercasual",
  skill: "hypercasual",
  tap: "hypercasual",
  relaxing: "hypercasual",
  runner: "hypercasual",
  running: "hypercasual",
  jumping: "hypercasual",

  /* adventure */
  adventure: "adventure",
  rpg: "adventure",
  "role playing": "adventure",
  quest: "adventure",
  platform: "adventure",
  platformer: "adventure",
  exploration: "adventure",
  escape: "adventure",
  "point and click": "adventure",
  story: "adventure",
  dungeon: "adventure",
  survival: "adventure",
  "open world": "adventure",

  /* shooting */
  shooting: "shooting",
  shooter: "shooting",
  shoot: "shooting",
  fps: "shooting",
  gun: "shooting",
  guns: "shooting",
  sniper: "shooting",
  war: "shooting",
  army: "shooting",
  military: "shooting",
  zombie: "shooting",
  tank: "shooting",
  defense: "shooting",
  "tower defense": "shooting",

  /* racing */
  racing: "racing",
  race: "racing",
  driving: "racing",
  drive: "racing",
  car: "racing",
  cars: "racing",
  bike: "racing",
  bikes: "racing",
  motorcycle: "racing",
  truck: "racing",
  drift: "racing",
  speed: "racing",
  parking: "racing",
  traffic: "racing",

  /* sports */
  sports: "sports",
  sport: "sports",
  soccer: "sports",
  football: "sports",
  basketball: "sports",
  baseball: "sports",
  golf: "sports",
  tennis: "sports",
  pool: "sports",
  billiards: "sports",
  bowling: "sports",
  fishing: "sports",
  boxing: "sports",
  cricket: "sports",
  hockey: "sports",
  skateboard: "sports",

  /* action */
  action: "action",
  ".io": "action",
  io: "action",
  fighting: "action",
  fight: "action",
  ninja: "action",
  superhero: "action",
  stickman: "action",
  multiplayer: "action",
  "2 player": "action",
  "2-player": "action",
  "two player": "action",
  "battle royale": "action",
  battle: "action",

  /* arcade */
  arcade: "arcade",
  retro: "arcade",
  classic: "arcade",
  pinball: "arcade",
  snake: "arcade",
  flappy: "arcade",
  endless: "arcade",

  /* clicker */
  clicker: "clicker",
  click: "clicker",
  idle: "clicker",
  incremental: "clicker",
  tycoon: "clicker",
  simulator: "clicker",
  simulation: "clicker",
  management: "clicker",
  business: "clicker",
  farm: "clicker",

  /* girls */
  girls: "girls",
  girl: "girls",
  "dress up": "girls",
  dressup: "girls",
  "dress-up": "girls",
  makeover: "girls",
  fashion: "girls",
  cooking: "girls",
  cook: "girls",
  makeup: "girls",
  beauty: "girls",
  hair: "girls",
  salon: "girls",
  baby: "girls",
  princess: "girls",
  wedding: "girls",
  doll: "girls",
};

function lookup(token) {
  if (!token) return null;
  const k = token.toLowerCase().trim();
  if (SLUG_SET.has(k)) return k;
  if (CATEGORY_SYNONYMS[k]) return CATEGORY_SYNONYMS[k];
  /* tolerate trailing punctuation / plurals like "puzzle." or "guns" */
  const stripped = k.replace(/[.\s]+$/g, "");
  if (SLUG_SET.has(stripped)) return stripped;
  if (CATEGORY_SYNONYMS[stripped]) return CATEGORY_SYNONYMS[stripped];
  return null;
}

/* Map a provider category (and optionally its tags) to a canonical slug.
 *   resolveCategory("Match 3", ["puzzle","kids"])           -> "puzzles"
 *   resolveCategory("Cooking Frenzy", ["girls"])            -> "girls"
 *   resolveCategory("Weird Genre", [], "action")            -> "action"
 */
export function resolveCategory(rawCategory, tags = [], fallback = DEFAULT_CATEGORY) {
  const direct = lookup(rawCategory);
  if (direct) return direct;

  const tagList = Array.isArray(tags)
    ? tags
    : String(tags || "").split(",");
  for (const t of tagList) {
    const hit = lookup(t);
    if (hit) return hit;
  }
  return fallback;
}

export function isValidCategory(slug) {
  return SLUG_SET.has(slug);
}
