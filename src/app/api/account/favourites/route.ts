import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/analytics/server";

const schema = z.object({ productId: z.string().uuid(), favourite: z.boolean() });

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: settings } = await admin.from("platform_settings").select("demo_data_visible").eq("id", true).maybeSingle();
  let productQuery = admin.from("products").select("id, vendor_id, product_status, vendors!inner(is_demo)").eq("id", parsed.data.productId);
  if (settings?.demo_data_visible === false) productQuery = productQuery.eq("is_demo", false).eq("vendors.is_demo", false);
  const { data: product } = await productQuery.maybeSingle();
  if (!product || product.product_status !== "approved") return NextResponse.json({ error: "product_not_found" }, { status: 404 });
  const result = parsed.data.favourite
    ? await admin.from("product_favourites").upsert({ user_id: auth.user.id, product_id: product.id }, { onConflict: "user_id,product_id" })
    : await admin.from("product_favourites").delete().eq("user_id", auth.user.id).eq("product_id", product.id);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (parsed.data.favourite) await trackServerEvent({ eventName: "favourite_added", userId: auth.user.id, productId: product.id, vendorId: product.vendor_id });
  return NextResponse.json({ favourite: parsed.data.favourite });
}
