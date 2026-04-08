import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/env";
import type { AuthChangeEvent, Session, AuthError } from "@supabase/supabase-js";

let _client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Clear all Supabase auth storage (cookies + localStorage).
 * Call this when encountering an unrecoverable auth error (refresh_token_not_found).
 */
export function clearAuthStorage() {
  // Clear localStorage keys set by Supabase
  if (typeof window !== "undefined") {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes("supabase") || key.includes("sb-"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // Clear Supabase auth cookies (pattern: sb-<project-ref>-auth-token*)
    document.cookie.split(";").forEach((c) => {
      const name = c.trim().split("=")[0];
      if (name.startsWith("sb-") && name.includes("auth")) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  }
}

/**
 * Singleton Supabase browser client.
 * Re-using a single instance avoids duplicate token-refresh attempts
 * (which cause repeated "Refresh Token Not Found" errors when the
 * session is stale) and reduces connection overhead.
 * 
 * Includes automatic handling of invalid refresh tokens:
 * - Clears stale auth storage
 * - Listeners for TOKEN_REFRESHED failures
 */
export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      getSupabaseUrl(),
      getSupabaseAnonKey()
    );

    // Set up global auth error handling
    _client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // If a token refresh happened but returned no session, the refresh token is invalid
      if (event === "TOKEN_REFRESHED" && !session) {
        console.warn("[Auth] Token refresh returned no session — clearing stale auth");
        clearAuthStorage();
      }
      // SIGNED_OUT should also clear storage to prevent stale token reuse
      if (event === "SIGNED_OUT") {
        clearAuthStorage();
      }
    });

    // Validate the current session on client creation
    // If getSession fails due to invalid refresh token, clear storage
    _client.auth.getSession().then(({ error }: { error: AuthError | null }) => {
      if (error?.code === "refresh_token_not_found" || error?.message?.includes("Refresh Token")) {
        console.warn("[Auth] Invalid refresh token detected on init — clearing auth");
        clearAuthStorage();
        // Force redirect to login
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    });
  }
  return _client;
}

/**
 * Reset the singleton client (useful after clearing auth storage).
 * Next call to createClient() will create a fresh instance.
 */
export function resetClient() {
  _client = null;
}

