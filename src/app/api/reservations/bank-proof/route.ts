import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { proofMime } from "@/lib/payments/bank";
import { rateLimit } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notifications/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = await getServerSupabase(); const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`bank-proof:${auth.user.id}`, 5, 60000).ok) return NextResponse.json({ error: "Please wait before retrying." }, { status: 429 });
  if (Number(request.headers.get("content-length")) > 5_300_000) return NextResponse.json({ error: "Maximum file size is 5 MB." }, { status: 413 });
  // Bound chunked bodies too; Content-Length can be absent or dishonest.
  const reader = request.body?.getReader(); const buffer = new Uint8Array(5_300_000); let length = 0;
  if (!reader) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    if (length + value.length > buffer.length) { await reader.cancel(); return NextResponse.json({ error: "Maximum file size is 5 MB." }, { status: 413 }); }
    buffer.set(value, length); length += value.length;
  }
  const form = await new Response(buffer.slice(0, length), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData().catch(() => null);
  const id = z.string().uuid().safeParse(form?.get("reservationId"));
  const file = form?.get("proof"); const reference = String(form?.get("reference") ?? "").trim();
  if (!id.success || !(file instanceof File) || !file.size || file.size > 5242880 || reference.length < 2 || reference.length > 120) return NextResponse.json({ error: "Add a transfer reference and a PDF, PNG or JPEG under 5 MB." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: order } = await admin.from("reservations").select("id, vendor_id, status, expires_at, payment_method, transfer_proof_path").eq("id", id.data).eq("customer_user_id", auth.user.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.payment_method !== "bank_transfer" || order.status !== "payment_pending" || Date.parse(order.expires_at) <= Date.now() || order.transfer_proof_path) return NextResponse.json({ error: "This order cannot accept proof. If you already transferred funds, contact the store to reconcile or refund; do not transfer again." }, { status: 409 });
  const bytes = new Uint8Array(await file.arrayBuffer()); const mime = proofMime(bytes);
  if (!mime) return NextResponse.json({ error: "Unsupported file content." }, { status: 400 });
  const path = `${order.id}/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
  const { error: uploadError } = await admin.storage.from("payment-proofs").upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) return NextResponse.json({ error: "Upload failed. Please retry." }, { status: 503 });
  const { data: changed, error } = await admin.from("reservations").update({ transfer_proof_path: path, transfer_reference: reference, transfer_submitted_at: new Date().toISOString() })
    .eq("id", order.id).eq("customer_user_id", auth.user.id).eq("status", "payment_pending").gt("expires_at", new Date().toISOString()).is("transfer_proof_path", null).select("id").maybeSingle();
  if (error || !changed) { await admin.storage.from("payment-proofs").remove([path]); return NextResponse.json({ error: "Order changed or expired. Contact the store if money was sent." }, { status: 409 }); }
  const { data: vendor } = await admin.from("vendors").select("owner_user_id").eq("id", order.vendor_id).single();
  if (vendor) await notifyUser({ userId: vendor.owner_user_id, kind: "order", title: "Bank transfer proof received", body: "Check cleared funds in your bank account before confirming this order. A receipt alone is not payment confirmation.", href: "/vendor/orders", dedupeKey: `bank-proof:${order.id}` });
  return NextResponse.json({ submitted: true });
}

export async function GET(request: Request) {
  const client = await getServerSupabase(); const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: order } = await admin.from("reservations").select("customer_user_id, vendor_id, transfer_proof_path").eq("id", id.data).maybeSingle();
  if (!order?.transfer_proof_path) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: vendor } = await admin.from("vendors").select("id").eq("id", order.vendor_id).eq("owner_user_id", auth.user.id).eq("verification_status", "approved").maybeSingle();
  if (order.customer_user_id !== auth.user.id && !vendor) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await admin.storage.from("payment-proofs").createSignedUrl(order.transfer_proof_path, 60, { download: "transfer-proof" });
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
