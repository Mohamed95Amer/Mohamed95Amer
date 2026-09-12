import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`request-image:${auth.user.id}`, 8, 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "image_required" }, { status: 400 });
  const extension = TYPES.get(file.type);
  if (!extension || file.size < 1 || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "invalid_image", message: "Use a JPG, PNG or WebP image up to 5 MB." }, { status: 400 });
  }

  const path = `${auth.user.id}/${randomUUID()}.${extension}`;
  const admin = getServiceSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "customer") return NextResponse.json({ error: "customer_account_required" }, { status: 403 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(file.type, bytes)) {
    return NextResponse.json({ error: "invalid_image", message: "The file content does not match its image type." }, { status: 400 });
  }
  const { error } = await admin.storage.from("buyer-request-images").upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  return NextResponse.json({ path });
}

function matchesSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
