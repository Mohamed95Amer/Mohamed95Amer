import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ path: z.string().min(3).max(500) });

/**
 * Issue a short-lived signed URL for a vendor document. The caller must either
 * own the document's vendor or be an admin.
 */
export async function POST(request: Request) {
  const userClient = getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).single();
  const isAdmin = profile && ["admin", "super_admin"].includes(profile.role);

  if (!isAdmin) {
    // Must own the vendor whose folder the path is in
    const vendorId = parsed.data.path.split("/")[0];
    if (!vendorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { data: vendor } = await admin
      .from("vendors")
      .select("id")
      .eq("id", vendorId)
      .eq("owner_user_id", auth.user.id)
      .maybeSingle();
    if (!vendor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await admin.storage
    .from("vendor-docs")
    .createSignedUrl(parsed.data.path, 60); // 60s lifetime
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}
