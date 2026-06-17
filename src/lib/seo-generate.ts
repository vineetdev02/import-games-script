/**
 * Shared SEO-content generator — OpenRouter FREE models with a fallback chain.
 *
 * Used by BOTH the bulk backfill script (scripts/generate-seo-content.ts) and
 * the per-game "Generate with AI" button (api/games/[id]/generate-seo). One
 * source of truth for the prompt + model chain so the two paths never drift.
 *
 * No paid API: it walks a list of OpenRouter free models in order and returns
 * the first one that produces valid content. If a model errors, is rate-limited
 * (429), truncates its output, or returns unparseable JSON, it moves to the
 * next model automatically. Pure logic (no Supabase / no "server-only") so the
 * standalone tsx script can import it too.
 *
 * Needs OPENROUTER_API_KEY in the environment (free key from openrouter.ai).
 * Override the chain with SEO_MODELS="id1,id2,..." if you want.
 */

export type FaqItem = { question: string; answer: string };
export type GeneratedContent = { about: string; faq: FaqItem[]; model?: string };

export type GameSeoInput = {
  title: string;
  description?: string | null;
  instructions?: string | null;
  category?: string | null;
  tags?: string | null;
};

/* Ordered free-model fallback chain (best/most-reliable first). Verified live
 * against the OpenRouter models API. Override via SEO_MODELS env var. */
const DEFAULT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3-coder:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "openrouter/free",
];

export function getModels(): string[] {
  const override = process.env.SEO_MODELS?.trim();
  if (override) return override.split(",").map((m) => m.trim()).filter(Boolean);
  return DEFAULT_MODELS;
}

const SYSTEM = `You write concise, accurate marketing copy for a free online browser-games portal.
Rules:
- Ground every sentence in the game details provided. Do NOT invent gameplay, characters, modes, or features that aren't implied by the description or instructions.
- No marketing fluff, no keyword stuffing, no emoji, no markdown, no headings.
- Natural, human tone. Vary sentence structure so it doesn't read like a template.
- Plain text only.
- Output ONLY a single JSON object. No prose before or after, no code fences.`;

function buildUserPrompt(g: GameSeoInput): string {
  const tags = (g.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return `Write SEO copy for this game and return it as JSON.

Title: ${g.title}
Category: ${g.category || "action"}
Tags: ${tags.length ? tags.join(", ") : "(none)"}
Provider description: ${g.description?.trim() || "(none)"}
Controls / instructions: ${g.instructions?.trim() || "(none)"}

Return EXACTLY this JSON shape (no extra keys, no markdown):
{
  "about": "120-180 words, exactly two short paragraphs separated by a blank line. Paragraph 1: what the game is and what you do in it. Paragraph 2: what makes it enjoyable + how/where to play (browser, free, desktop/mobile). Specific to THIS game.",
  "faq": [
    { "question": "...", "answer": "1-2 sentences" }
  ]
}

The "faq" array must have 4 or 5 entries unique to THIS game: how to play / controls (use the instructions), whether it's free, device support, and one game-specific question (a tip, the goal, or what's fun).`;
}

/* Free models often wrap JSON in prose or code fences — pull the object out. */
function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

type ORChoice = {
  message?: { content?: string | null };
  finish_reason?: string;
};

async function callModel(model: string, g: GameSeoInput): Promise<GeneratedContent> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "actiongames.io SEO",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(g) },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${body.slice(0, 120)}`);
  }

  const data = (await res.json()) as { choices?: ORChoice[]; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message || "provider error");

  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("output truncated");
  const content = choice?.message?.content?.trim();
  if (!content) throw new Error("empty response");

  const parsed = extractJson(content) as { about?: string; faq?: FaqItem[] };
  const about = (parsed.about || "").trim();
  const faq = (parsed.faq || [])
    .filter((f) => f?.question?.trim() && f?.answer?.trim())
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }));

  if (!about || faq.length < 3) throw new Error("incomplete content");
  return { about, faq, model };
}

/** Walk the free-model chain; return the first valid result. */
export async function generateSeoContent(g: GameSeoInput): Promise<GeneratedContent> {
  const models = getModels();
  const errors: string[] = [];
  for (const model of models) {
    try {
      return await callModel(model, g);
    } catch (err) {
      errors.push(`${model}: ${(err as Error).message}`);
    }
  }
  throw new Error(`all ${models.length} models failed — ${errors.join(" | ")}`);
}
