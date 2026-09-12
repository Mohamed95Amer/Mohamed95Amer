import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Until codegen is wired, use a permissive client type so queries return
// usable shapes rather than `never`.
type AnyClient = SupabaseClient<any, "public", any>;

// Next.js 14 caches server-side GET requests by default. Supabase reads back
// live prices, inventory and reservation state, so allowing its internal fetch
// calls into the Data Cache can freeze a perfectly successful response.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

/**
 * Per-request server client that respects the user's session via cookies.
 * Use this for any operation that should be authorized as the current user.
 */
export function getServerSupabase(): AnyClient {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: { fetch: noStoreFetch },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // setting cookies is only allowed in Route Handlers / Server Actions
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // ignore
        }
      },
    },
  });
}

/**
 * Service-role client. NEVER use this in code that runs in the browser.
 * Bypasses RLS. Only call from API routes / server actions / cron endpoints
 * where the operation has been authorized server-side.
 */
export function getServiceSupabase(): AnyClient {
  if (typeof window !== "undefined") {
    throw new Error("getServiceSupabase() must not be called from the browser");
  }

  // Create this client per request. Vercel Fluid compute can reuse modules
  // across requests, while the service client carries request-scoped fetch
  // behavior and must never retain cached live marketplace state.
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    global: { fetch: noStoreFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
