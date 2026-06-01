/* Provider registry + normalizer.
 *
 * Adding a new provider:
 *   1. Define `detect(raw)`: return true if the JSON looks like this provider's shape.
 *   2. Define `process(raw, opts)`: return an array of normalized game rows.
 *   3. Register it in PROVIDERS below.
 *
 * opts = { overrideCategory, forceAll } — see categories.mjs. Every row's
 * `category` is mapped to one of web0.2's canonical slugs so games never
 * land on a category page that doesn't exist.
 */

import { resolveCategory, DEFAULT_CATEGORY } from "./categories.mjs";

/* Pick the canonical category slug for a game.
 * forceAll → every game gets the override slug (single-genre batch).
 * otherwise → auto-map provider category/tags, falling back to "action". */
function pickCategory(rawCategory, tagList, { overrideCategory, forceAll } = {}) {
  if (forceAll && overrideCategory) return overrideCategory;
  return resolveCategory(rawCategory, tagList, DEFAULT_CATEGORY);
}

/* ---------- text cleanup ---------- */
const ENTITY_REPLACEMENTS = [
  [/&amp;mdash;|&mdash;/g, "—"],
  [/&amp;ndash;|&ndash;/g, "–"],
  [/\bmdash\b/g, "—"],
  [/\bndash\b/g, "–"],
  [/&amp;quot;|&quot;/g, '"'],
  [/&amp;#39;|&#39;|&amp;apos;|&apos;/g, "'"],
  [/&amp;nbsp;|&nbsp;/g, " "],
  [/&amp;hellip;|&hellip;/g, "…"],
  [/&amp;ldquo;|&ldquo;/g, "“"],
  [/&amp;rdquo;|&rdquo;/g, "”"],
  [/&amp;lsquo;|&lsquo;/g, "‘"],
  [/&amp;rsquo;|&rsquo;/g, "’"],
  [/&amp;lt;|&lt;/g, "<"],
  [/&amp;gt;|&gt;/g, ">"],
  [/&amp;|&AMP;/g, "&"],
];

export function cleanText(input) {
  if (input === null || input === undefined) return "";
  let out = String(input);
  for (const [re, rep] of ENTITY_REPLACEMENTS) out = out.replace(re, rep);
  return out.replace(/[ \t]+/g, " ").trim();
}

export function slugify(input) {
  return cleanText(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function determineOrientation(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!w || !h) return "landscape";
  return w >= h ? "landscape" : "portrait";
}

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
function deriveIsNew(datePublishedIso) {
  if (!datePublishedIso) return false;
  const t = new Date(datePublishedIso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_WINDOW_MS;
}

function parseDate(raw) {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/* ---------- providers ---------- */

const gameMonetizeFeaturedTags = new Set([
  "best games",
  "best",
  "top games",
  "popular",
  "featured",
]);

const gameMonetize = {
  id: "gamemonitize",
  label: "GameMonetize",
  detect(raw) {
    /* GameMonetize ships an array of objects with `url` + `thumb` + `tags`. */
    if (!Array.isArray(raw) || !raw.length) return false;
    const sample = raw[0];
    return (
      typeof sample === "object" &&
      sample !== null &&
      "url" in sample &&
      "thumb" in sample &&
      ("tags" in sample || "category" in sample)
    );
  },
  process(raw, opts) {
    if (!Array.isArray(raw)) throw new Error("GameMonetize data must be an array");
    return raw.map((game) => {
      const cleanedTitle = cleanText(game.title) || "Untitled";
      const id = String(game.id ?? "");
      const slug = `${slugify(cleanedTitle) || "game"}${id ? "-" + id : ""}`;
      const tagsString = cleanText(game.tags);
      const tagsLower = tagsString
        .toLowerCase()
        .split(",")
        .map((t) => t.trim());
      const category = pickCategory(game.category, tagsLower, opts);
      return {
        provider_game_id: id,
        title: cleanedTitle,
        description: cleanText(game.description),
        instructions: cleanText(game.instructions) || null,
        slug,
        category,
        main_category: category,
        tags: tagsString,
        orientation: determineOrientation(game.width, game.height),
        quality_score: null,
        width: Number(game.width) || 800,
        height: Number(game.height) || 600,
        date_modified: null,
        date_published: null,
        banner_image: null,
        thumbnail_image: game.thumb || "",
        play_url: game.url || "",
        provider: "gamemonitize",
        is_featured: tagsLower.some((t) => gameMonetizeFeaturedTags.has(t)),
        is_new: false /* no publish date available */,
      };
    });
  },
};

const gamePix = {
  id: "gamepix",
  label: "GamePix",
  detect(raw) {
    /* GamePix ships an object with `items` array. Items have `namespace` + `quality_score`. */
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items) || !raw.items.length) {
      return false;
    }
    const sample = raw.items[0];
    return (
      typeof sample === "object" &&
      sample !== null &&
      ("namespace" in sample || "quality_score" in sample)
    );
  },
  process(raw, opts) {
    if (!raw || !Array.isArray(raw.items)) {
      throw new Error("GamePix data must contain an `items` array");
    }
    const FEATURED_THRESHOLD = 0.85;
    return raw.items.map((game) => {
      const cleanedTitle = cleanText(game.title) || "Untitled";
      const id = String(game.id ?? "");
      const baseSlug = game.namespace ? slugify(game.namespace) : slugify(cleanedTitle);
      const slug = `${baseSlug || "game"}${id ? "-" + id : ""}`;
      const datePublished = parseDate(game.date_published);
      /* GamePix feed carries no tag list, so mapping leans on `category`. */
      const category = pickCategory(game.category, [], opts);
      return {
        provider_game_id: id,
        title: cleanedTitle,
        description: cleanText(game.description),
        instructions: null,
        slug,
        category,
        main_category: category,
        tags: "",
        orientation: game.orientation || determineOrientation(game.width, game.height),
        quality_score: typeof game.quality_score === "number" ? game.quality_score : null,
        width: Number(game.width) || 800,
        height: Number(game.height) || 600,
        date_modified: parseDate(game.date_modified),
        date_published: datePublished,
        banner_image: game.banner_image || null,
        thumbnail_image: game.image || "",
        play_url: game.url || "",
        provider: "gamepix",
        is_featured:
          typeof game.quality_score === "number" && game.quality_score >= FEATURED_THRESHOLD,
        is_new: deriveIsNew(datePublished),
      };
    });
  },
};

export const PROVIDERS = [gameMonetize, gamePix];
export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/* Detect provider from JSON shape. Returns provider object or null. */
export function detectProvider(raw) {
  for (const provider of PROVIDERS) {
    try {
      if (provider.detect(raw)) return provider;
    } catch {
      /* skip detection errors, try next */
    }
  }
  return null;
}

/* Top-level dispatcher. providerId may be 'auto', 'gamemonitize', 'gamepix', etc.
 * opts = { overrideCategory, forceAll } controls category mapping.
 * Returns { games, providerId, detected } */
export function normalize(raw, providerId, opts = {}) {
  let provider;
  let detected = false;
  if (!providerId || providerId === "auto") {
    provider = detectProvider(raw);
    if (!provider) {
      throw new Error(
        "Could not auto-detect provider. Try selecting a specific provider from the dropdown.",
      );
    }
    detected = true;
  } else {
    provider = PROVIDER_BY_ID[providerId];
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
  }
  const games = provider.process(raw, opts);
  return { games, providerId: provider.id, providerLabel: provider.label, detected };
}

export function fillDefaults(game) {
  return {
    ...game,
    play_count: typeof game.play_count === "number" ? game.play_count : 0,
  };
}

/* Back-compat exports (so anything still calling these works) */
export const processGameMonetize = (raw, opts) => gameMonetize.process(raw, opts);
export const processGamePix = (raw, opts) => gamePix.process(raw, opts);
