import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().uuid();

export async function GET(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  const parsed = querySchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: verification } = await admin
    .from("order_identity_verifications")
    .select("status, expires_at")
    .eq("id", parsed.data)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!verification) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!["consumed", "rejected", "expired"].includes(verification.status) && Date.parse(verification.expires_at) <= Date.now()) {
    await admin.from("order_identity_verifications").update({ status: "expired" }).eq("id", parsed.data);
    return NextResponse.json({ status: "expired" });
  }
  return NextResponse.json({ status: verification.status });
}
