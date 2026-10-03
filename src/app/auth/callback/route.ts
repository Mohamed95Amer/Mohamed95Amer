import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { safeInternalRedirect } from "@/lib/auth/redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalRedirect(url.searchParams.get("next"));
  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=That+link+is+invalid+or+expired", url.origin));
}
