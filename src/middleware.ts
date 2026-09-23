import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Refresh the Supabase session cookie on every request so that
 * server components see a valid session.
 */
export async function middleware(request: NextRequest) {
  const method = request.method.toUpperCase();
  const isUnsafeApiMutation =
    request.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    !request.nextUrl.pathname.startsWith("/api/cron/") &&
    !request.nextUrl.pathname.startsWith("/api/webhooks/");

  // Cookie-authenticated mutations must originate from this site. Requests
  // authenticated explicitly by a server-side bearer token do not carry the
  // browser session cookie and are not vulnerable to cookie-based CSRF.
  if (isUnsafeApiMutation && request.headers.has("cookie")) {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("host");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : request.nextUrl.protocol.replace(":", "");
    const allowedOrigins = new Set([
      request.nextUrl.origin,
      ...(requestHost ? [`${protocol}://${requestHost}`] : []),
      ...(forwardedHost ? [`${protocol}://${forwardedHost}`] : []),
    ]);
    if (!origin || !allowedOrigins.has(origin)) {
      return NextResponse.json(
        { error: "Cross-site request blocked" },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next static
     *  - _next image
     *  - favicon, robots, etc
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
