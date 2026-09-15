import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { adminCancelSchema, siteBannerCreateSchema } from "@/lib/validation/schemas";
import { MARKETING_ASSET_BUCKET } from "@/lib/marketing";
import { logAudit } from "@/lib/audit";
import { ipFromRequest } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

async function adminContext() {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return null;
  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  return profile && ["admin", "super_admin"].includes(profile.role) ? { user: auth.user, profile, admin } : null;
}

export async function POST(request: Request) {
  const context = await adminContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  const value = (name: string) => String(form.get(name) ?? "").trim();
  const parsed = siteBannerCreateSchema.safeParse({
    title: value("title"), body: value("body") || null, imageAlt: value("imageAlt") || null,
    ctaLabel: value("ctaLabel") || null, ctaHref: value("ctaHref") || null,
    placement: value("placement"), displayOrder: Number(value("displayOrder") || 0),
    durationDays: Number(value("durationDays")), startsAt: value("startsAt") || null,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  const candidate = form.get("image");
  const image = candidate instanceof File && candidate.size > 0 ? candidate : null;
  if (image && (!ALLOWED_TYPES.has(image.type) || image.size > 5 * 1024 * 1024)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP image up to 5 MB." }, { status: 400 });
  }
  if (image && !parsed.data.imageAlt) return NextResponse.json({ error: "Describe the banner image for accessibility." }, { status: 400 });

  let imagePath: string | null = null;
  if (image) {
    imagePath = `admin/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ALLOWED_TYPES.get(image.type)}`;
    const { error: uploadError } = await context.admin.storage.from(MARKETING_ASSET_BUCKET).upload(imagePath, image, { contentType: image.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }
  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationDays * 86_400_000);
  const { data, error } = await context.admin.from("site_banners").insert({
    title: parsed.data.title, body: parsed.data.body || null, image_path: imagePath,
    image_alt: imagePath ? parsed.data.imageAlt : null, cta_label: parsed.data.ctaLabel || null,
    cta_href: parsed.data.ctaHref || null, placement: parsed.data.placement,
    display_order: parsed.data.displayOrder, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    created_by_user_id: context.user.id,
  }).select("*").single();
  if (error || !data) {
    if (imagePath) await context.admin.storage.from(MARKETING_ASSET_BUCKET).remove([imagePath]);
    return NextResponse.json({ error: error?.message ?? "create_failed" }, { status: 500 });
  }
  await logAudit({ actor_user_id: context.user.id, actor_role: context.profile.role, action: "site_banner.created", entity_type: "site_banner", entity_id: data.id, new_value: data, ip_address: ipFromRequest(request) });
  return NextResponse.json({ banner: data });
}

export async function DELETE(request: Request) {
  const context = await adminContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = adminCancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { data: previous } = await context.admin.from("site_banners").select("*").eq("id", parsed.data.id).maybeSingle();
  if (!previous) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const now = new Date().toISOString();
  const { error } = await context.admin.from("site_banners").update({ cancelled_at: now, cancelled_by_user_id: context.user.id }).eq("id", parsed.data.id).is("cancelled_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actor_user_id: context.user.id, actor_role: context.profile.role, action: "site_banner.cancelled", entity_type: "site_banner", entity_id: parsed.data.id, old_value: previous, new_value: { cancelled_at: now }, ip_address: ipFromRequest(request) });
  return NextResponse.json({ ok: true });
}
