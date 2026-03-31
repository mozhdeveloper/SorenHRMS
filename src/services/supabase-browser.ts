import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/env";

let _client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Singleton Supabase browser client.
 * Re-using a single instance avoids duplicate token-refresh attempts
 * (which cause repeated "Refresh Token Not Found" errors when the
 * session is stale) and reduces connection overhead.
 */
export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      getSupabaseUrl(),
      getSupabaseAnonKey()
    );
  }
  return _client;
}
