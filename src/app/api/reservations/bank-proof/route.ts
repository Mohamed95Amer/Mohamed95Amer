import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { proofMime } from "@/lib/payments/bank";
import { distributedRateLimit, ipFromRequest } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notifications/server";
import { logAudit } from "@/lib/audit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = await getServerSupabase(); const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await distributedRateLimit(`bank-proof:${auth.user.id}`, 5, 60000)).ok) return NextResponse.json({ error: "Please wait before retrying." }, { status: 429 });
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
  const rawFile = form?.get("proof"); const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null; const reference = String(form?.get("reference") ?? "").trim();
  if (!id.success || (file && file.size > 5242880) || reference.length > 120) return NextResponse.json({ error: "Use an optional reference and an optional PDF, PNG or JPEG under 5 MB." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: order } = await admin.from("reservations").select("id, vendor_id, status, expires_at, payment_method, transfer_proof_path, transfer_submitted_at").eq("id", id.data).eq("customer_user_id", auth.user.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!["bank_transfer", "aani"].includes(order.payment_method) || order.status !== "payment_pending" || Date.parse(order.expires_at) <= Date.now() || order.transfer_submitted_at) return NextResponse.json({ error: "This order cannot be marked paid. If money was already sent, contact the store; do not pay twice." }, { status: 409 });
  let path: string | null = null;
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer()); const mime = proofMime(bytes);
    if (!mime) return NextResponse.json({ error: "Unsupported file content." }, { status: 400 });
    path = `${order.id}/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
    const { error: uploadError } = await admin.storage.from("payment-proofs").upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) return NextResponse.json({ error: "Upload failed. Please retry." }, { status: 503 });
  }
  const submittedAt = new Date().toISOString();
  const { data: changed, error } = await admin.from("reservations").update({ status: "payment_verification", payment_status: "verification_pending", transfer_proof_path: path, transfer_reference: reference || null, transfer_submitted_at: submittedAt, expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() })
    .eq("id", order.id).eq("customer_user_id", auth.user.id).eq("status", "payment_pending").gt("expires_at", submittedAt).is("transfer_submitted_at", null).select("id").maybeSingle();
  if (error || !changed) { if (path) await admin.storage.from("payment-proofs").remove([path]); return NextResponse.json({ error: "Order changed or expired. Contact the store if money was sent." }, { status: 409 }); }
  const { data: vendor } = await admin.from("vendors").select("owner_user_id").eq("id", order.vendor_id).single();
  await Promise.all([
    vendor ? notifyUser({ userId: vendor.owner_user_id, kind: "order", title: "Customer marked payment as sent", body: "Check your own Aani or bank account before confirming receipt. A screenshot or transaction reference alone is not payment confirmation.", href: "/vendor/orders", dedupeKey: `bank-proof:${order.id}` }) : Promise.resolve(),
    logAudit({ actor_user_id: auth.user.id, actor_role: "customer", action: "reservation.payment_marked_sent", entity_type: "reservation", entity_id: order.id, old_value: { status: order.status }, new_value: { status: "payment_verification", submitted_at: submittedAt, has_reference: Boolean(reference), has_proof: Boolean(path) }, ip_address: ipFromRequest(request) }),
  ]);
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
  const [{ data: vendor }, { data: profile }] = await Promise.all([
    admin.from("vendors").select("id").eq("id", order.vendor_id).eq("owner_user_id", auth.user.id).eq("verification_status", "approved").maybeSingle(),
    admin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
  ]);
  const isAdmin = profile && ["admin", "super_admin"].includes(profile.role);
  if (order.customer_user_id !== auth.user.id && !vendor && !isAdmin) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data, error } = await admin.storage.from("payment-proofs").createSignedUrl(order.transfer_proof_path, 60, { download: "transfer-proof" });
  if (error || !data) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
