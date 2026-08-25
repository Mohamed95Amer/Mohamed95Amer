import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Until codegen is wired, use a permissive client type so queries return
// usable shapes rather than `never`.
type AnyClient = SupabaseClient<any, "public", any>;

/**
 * Per-request server client that respects the user's session via cookies.
 * Use this for any operation that should be authorized as the current user.
 */
export function getServerSupabase(): AnyClient {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
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
let _admin: AnyClient | null = null;
export function getServiceSupabase(): AnyClient {
  if (typeof window !== "undefined") {
    throw new Error("getServiceSupabase() must not be called from the browser");
  }
  if (_admin) return _admin;
  _admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
