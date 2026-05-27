/* Batched, concurrent upsert for the games table.
 * Reports progress via an EventEmitter so the SSE endpoint can forward it.
 *
 * Key contract:
 *  - Uses Supabase `upsert({}, { onConflict: 'provider,provider_game_id' })`
 *    which requires a UNIQUE index on (provider, provider_game_id) in the DB.
 *  - Excludes `play_count` from the upsert payload so existing play counts
 *    aren't zeroed out on re-import.
 *  - Each batch is parallel up to `concurrency`. Failed batches don't abort
 *    the run — they're recorded and the next batch starts.
 */

import { EventEmitter } from "node:events";
import { fillDefaults } from "./normalize.mjs";
import { saveCheckpoint } from "./checkpoint.mjs";

const PROTECTED_ON_UPDATE = new Set(["play_count"]);

/* Strip fields we don't want to overwrite during upsert. Supabase will
 * still insert them as defaults on first insert (since they're not in
 * the payload, the column default kicks in). */
function stripProtectedFields(game) {
  const out = {};
  for (const [k, v] of Object.entries(game)) {
    if (PROTECTED_ON_UPDATE.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export function createImporter({ supabase, batchSize = 100, concurrency = 5 }) {
  const events = new EventEmitter();
  const state = {
    status: "idle",
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    failedGames: [],
    startedAt: null,
    endedAt: null,
    cancelRequested: false,
    error: null,
  };

  function emitProgress(extra = {}) {
    events.emit("progress", {
      status: state.status,
      total: state.total,
      processed: state.processed,
      succeeded: state.succeeded,
      failed: state.failed,
      pctComplete: state.total ? Math.round((state.processed / state.total) * 100) : 0,
      ...extra,
    });
  }

  async function upsertBatch(batch) {
    const payload = batch.map((g) => stripProtectedFields(fillDefaults(g)));
    const { error } = await supabase
      .from("games")
      .upsert(payload, { onConflict: "provider,provider_game_id" });
    if (error) throw error;
  }

  async function run({ importId, games }) {
    state.status = "running";
    state.total = games.length;
    state.processed = 0;
    state.succeeded = 0;
    state.failed = 0;
    state.failedGames = [];
    state.startedAt = new Date().toISOString();
    state.endedAt = null;
    state.cancelRequested = false;
    state.error = null;
    emitProgress();

    const batches = chunk(games, batchSize);
    let cursor = 0;

    async function worker() {
      while (cursor < batches.length) {
        if (state.cancelRequested) return;
        const idx = cursor++;
        const batch = batches[idx];
        try {
          await upsertBatch(batch);
          state.succeeded += batch.length;
        } catch (err) {
          state.failed += batch.length;
          for (const g of batch) {
            state.failedGames.push({
              title: g.title,
              provider: g.provider,
              provider_game_id: g.provider_game_id,
              reason: err.message || String(err),
            });
          }
          events.emit("batch_error", { batchIndex: idx, error: err.message || String(err) });
        } finally {
          state.processed += batch.length;
          emitProgress();
          /* checkpoint every ~5 batches to keep disk noise low */
          if (idx % 5 === 0) {
            await saveCheckpoint(importId, { ...state, gamesRemaining: games.slice(state.processed) }).catch(() => {});
          }
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () => worker());
    await Promise.all(workers);

    state.endedAt = new Date().toISOString();
    state.status = state.cancelRequested ? "cancelled" : "complete";
    emitProgress({ endedAt: state.endedAt });
    await saveCheckpoint(importId, state).catch(() => {});
    events.emit("done", state);
    return state;
  }

  function cancel() {
    state.cancelRequested = true;
  }

  function snapshot() {
    return { ...state };
  }

  return { run, cancel, events, snapshot };
}
