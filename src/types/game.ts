/* The `games` table row shape, as stored in Supabase. Column names
 * match the existing import pipeline (snake_case). The admin dashboard
 * reads/writes these directly. web0.2 normalizes them on read. */
export interface GameRow {
  id: string | number;
  title: string;
  description: string | null;
  instructions: string | null;
  slug: string;
  category: string;
  main_category: string | null;
  tags: string | null;
  orientation: "landscape" | "portrait" | null;
  quality_score: number | null;
  width: number | null;
  height: number | null;
  date_modified: string | null;
  date_published: string | null;
  banner_image: string | null;
  thumbnail_image: string | null;
  play_url: string;
  provider: string;
  provider_game_id: string | null;
  is_featured: boolean | null;
  is_new: boolean | null;
  is_banner: boolean | null;
  play_count: number | null;
  seo_about: string | null;
  seo_faq: { question: string; answer: string }[] | null;
  created_at?: string | null;
}

/* A normalized game produced by the importer, ready to upsert. */
export interface NormalizedGame {
  provider_game_id: string;
  title: string;
  description: string;
  instructions: string | null;
  slug: string;
  category: string;
  main_category: string;
  tags: string;
  orientation: "landscape" | "portrait";
  quality_score: number | null;
  width: number;
  height: number;
  date_modified: string | null;
  date_published: string | null;
  banner_image: string | null;
  thumbnail_image: string;
  play_url: string;
  provider: string;
  is_featured: boolean;
  is_new: boolean;
  is_banner: boolean;
}

export interface Category {
  slug: string;
  label: string;
  icon?: string;
  description?: string;
  featured?: boolean;
  coverImage?: string;
}

export type ImageHealth = "ok" | "missing" | "broken" | "unchecked";
