import "server-only";
import { resolveCategory } from "./category-map";
import { DEFAULT_CATEGORY } from "./categories";
import type { NormalizedGame } from "@/types/game";

/* Provider normalizer — ported from import-games-script/server/lib/normalize.mjs.
 * Auto-detects GameMonetize vs GamePix shape and produces canonical rows. */

const ENTITY: [RegExp, string][] = [
  [/&amp;mdash;|&mdash;/g, "—"],
  [/&amp;ndash;|&ndash;/g, "–"],
  [/\bmdash\b/g, "—"],
  [/\bndash\b/g, "–"],
  [/&amp;quot;|&quot;/g, '"'],
  [/&amp;#39;|&#39;|&amp;apos;|&apos;/g, "'"],
  [/&amp;nbsp;|&nbsp;/g, " "],
  [/&amp;hellip;|&hellip;/g, "…"],
  [/&amp;lt;|&lt;/g, "<"],
  [/&amp;gt;|&gt;/g, ">"],
  [/&amp;|&AMP;/g, "&"],
];

export function cleanText(input: unknown): string {
  if (input == null) return "";
  let out = String(input);
  for (const [re, rep] of ENTITY) out = out.replace(re, rep);
  return out.replace(/[ \t]+/g, " ").trim();
}

export function slugify(input: string): string {
  return cleanText(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function orientation(w: unknown, h: unknown): "landscape" | "portrait" {
  const ww = Number(w);
  const hh = Number(h);
  if (!ww || !hh) return "landscape";
  return ww >= hh ? "landscape" : "portrait";
}

function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  const t = new Date(raw as string).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
function deriveIsNew(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && Date.now() - t < NEW_WINDOW_MS;
}

const GM_FEATURED = new Set(["best games", "best", "top games", "popular", "featured"]);

export type ProviderId = "gamemonitize" | "gamepix";
export interface NormalizeOpts {
  overrideCategory?: string;
  forceAll?: boolean;
}

function pickCategory(rawCategory: unknown, tags: string[], opts: NormalizeOpts): string {
  if (opts.forceAll && opts.overrideCategory) return opts.overrideCategory;
  return resolveCategory(rawCategory as string, tags, DEFAULT_CATEGORY);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function detect(raw: any): ProviderId | null {
  if (Array.isArray(raw) && raw.length) {
    const s = raw[0];
    if (s && typeof s === "object" && "url" in s && "thumb" in s && ("tags" in s || "category" in s))
      return "gamemonitize";
  }
  if (raw && typeof raw === "object" && Array.isArray(raw.items) && raw.items.length) {
    const s = raw.items[0];
    if (s && typeof s === "object" && ("namespace" in s || "quality_score" in s)) return "gamepix";
  }
  return null;
}

function processGameMonetize(raw: any[], opts: NormalizeOpts): NormalizedGame[] {
  return raw.map((g) => {
    const title = cleanText(g.title) || "Untitled";
    const id = String(g.id ?? "");
    const slug = `${slugify(title) || "game"}${id ? "-" + id : ""}`;
    const tagsStr = cleanText(g.tags);
    const tagsLower = tagsStr.toLowerCase().split(",").map((t) => t.trim());
    const category = pickCategory(g.category, tagsLower, opts);
    return {
      provider_game_id: id,
      title,
      description: cleanText(g.description),
      instructions: cleanText(g.instructions) || null,
      slug,
      category,
      main_category: category,
      tags: tagsStr,
      orientation: orientation(g.width, g.height),
      quality_score: null,
      width: Number(g.width) || 800,
      height: Number(g.height) || 600,
      date_modified: null,
      date_published: null,
      banner_image: null,
      thumbnail_image: g.thumb || "",
      play_url: g.url || "",
      provider: "gamemonitize",
      is_featured: tagsLower.some((t) => GM_FEATURED.has(t)),
      is_new: false,
      is_banner: false,
    };
  });
}

function processGamePix(raw: any, opts: NormalizeOpts): NormalizedGame[] {
  const THRESH = 0.85;
  return raw.items.map((g: any) => {
    const title = cleanText(g.title) || "Untitled";
    const id = String(g.id ?? "");
    const base = g.namespace ? slugify(g.namespace) : slugify(title);
    const slug = `${base || "game"}${id ? "-" + id : ""}`;
    const datePublished = parseDate(g.date_published);
    const category = pickCategory(g.category, [], opts);
    return {
      provider_game_id: id,
      title,
      description: cleanText(g.description),
      instructions: null,
      slug,
      category,
      main_category: category,
      tags: "",
      orientation: g.orientation || orientation(g.width, g.height),
      quality_score: typeof g.quality_score === "number" ? g.quality_score : null,
      width: Number(g.width) || 800,
      height: Number(g.height) || 600,
      date_modified: parseDate(g.date_modified),
      date_published: datePublished,
      banner_image: g.banner_image || null,
      thumbnail_image: g.image || "",
      play_url: g.url || "",
      provider: "gamepix",
      is_featured: typeof g.quality_score === "number" && g.quality_score >= THRESH,
      is_new: deriveIsNew(datePublished),
      is_banner: false,
    };
  });
}

export interface NormalizeResult {
  games: NormalizedGame[];
  provider: ProviderId;
  detected: boolean;
}

export function normalize(
  raw: any,
  providerId: ProviderId | "auto",
  opts: NormalizeOpts = {},
): NormalizeResult {
  let provider: ProviderId | null;
  let detected = false;
  if (!providerId || providerId === "auto") {
    provider = detect(raw);
    if (!provider) throw new Error("Could not auto-detect provider — pick one manually.");
    detected = true;
  } else {
    provider = providerId;
  }
  const games =
    provider === "gamemonitize"
      ? processGameMonetize(raw as any[], opts)
      : processGamePix(raw, opts);
  return { games, provider, detected };
}
