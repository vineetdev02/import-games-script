import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Service-role client — full write access, bypasses RLS. This is a
 * LOCAL ADMIN TOOL ONLY. The service key must never reach the browser;
 * everything in this file is server-only and only imported by route
 * handlers / server code. */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

export const SUPABASE_CONFIGURED = Boolean(url && serviceKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!SUPABASE_CONFIGURED) {
    throw new Error(
      "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local",
    );
  }
  if (!client) {
    client = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "actiongames-admin" } },
    });
  }
  return client;
}

export const GAMES_TABLE = "games";
