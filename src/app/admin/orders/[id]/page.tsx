import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { AdminPaymentDisputeActions } from "@/components/AdminPaymentDisputeActions";

export const dynamic = "force-dynamic";

function elapsed(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function methodLabel(method: string) {
  if (method === "aani") return "Aani instant transfer to vendor";
  if (method === "bank_transfer") return "Bank transfer to vendor";
  if (method === "card") return "Vendor card terminal/link";
  if (["cash", "pay_at_store"].includes(method)) return "Cash/direct to vendor";
  return statusLabel(method);
}

export default async function AdminOrderPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getServiceSupabase();
  const { data: order } = await admin.from("reservations").select(
    "id, status, quantity, created_at, expires_at, payment_method, payment_status, vendor_confirmed_price_aed, vendor_price_confirmed_at, customer_price_accepted_at, payment_window_started_at, payment_window_expires_at, transfer_submitted_at, transfer_reference, transfer_proof_path, payment_confirmed_at, payment_confirmed_by, payment_dispute_status, payment_dispute_note, payment_dispute_resolution_note, payment_disputed_at, payment_dispute_resolved_at, vendor:vendors(business_name), customer:profiles!reservations_customer_user_id_fkey(full_name), payment_confirmer:profiles!reservations_payment_confirmed_by_fkey(full_name), product:products(name), snapshot:order_price_snapshots(total_price_aed)",
  ).eq("id", id).maybeSingle();
  if (!order) notFound();

  const [{ data: audit }, confirmerAuth] = await Promise.all([
    admin.from("audit_logs").select("id, action, actor_role, created_at, actor:profiles(full_name)").eq("entity_type", "reservation").eq("entity_id", order.id).in("action", ["reservation.payment_marked_sent", "reservation.confirm_payment_received", "reservation.payment_dispute_report", "reservation.payment_dispute_resolve", "reservation.payment_dispute_clear"]).order("created_at", { ascending: true }),
    order.payment_confirmed_by ? admin.auth.admin.getUserById(order.payment_confirmed_by) : Promise.resolve({ data: { user: null }, error: null }),
  ]);

  const customer = order.customer as unknown as { full_name: string | null } | null;
  const vendor = order.vendor as unknown as { business_name: string } | null;
  const product = order.product as unknown as { name: string } | null;
  const confirmer = order.payment_confirmer as unknown as { full_name: string | null } | null;
  const snapshot = order.snapshot as unknown as { total_price_aed: number } | { total_price_aed: number }[] | null;
  const estimate = Array.isArray(snapshot) ? snapshot[0]?.total_price_aed : snapshot?.total_price_aed;
  const amount = order.vendor_confirmed_price_aed ?? estimate;
  const now = Date.now();
  const deadline = order.payment_window_expires_at ? Date.parse(order.payment_window_expires_at) : null;
  const submittedAt = order.transfer_submitted_at ? Date.parse(order.transfer_submitted_at) : null;
  const confirmedAt = order.payment_confirmed_at ? Date.parse(order.payment_confirmed_at) : null;
  const submittedLate = Boolean(deadline && submittedAt && submittedAt > deadline);
  const paymentOverdue = Boolean(deadline && !submittedAt && now > deadline && ["payment_pending", "expired"].includes(order.status));
  const verificationDelayed = Boolean(submittedAt && !confirmedAt && now - submittedAt > 24 * 60 * 60 * 1000);
  const confirmationDelayed = Boolean(submittedAt && confirmedAt && confirmedAt - submittedAt > 24 * 60 * 60 * 1000);
  const confirmationTime = elapsed(order.transfer_submitted_at, order.payment_confirmed_at);

  return (
    <div>
      <Link href="/admin/orders" className="text-sm font-semibold text-jade-700 hover:underline">← Back to orders</Link>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="eyebrow text-jade-600">Payment trail</p><h2 className="mt-1 font-serif text-3xl font-semibold text-jade-950">{product?.name ?? "Order"}</h2><p className="mt-1 break-all text-xs text-ink-muted">Get Gold reference: {order.id}</p></div>
        <div className="flex flex-wrap gap-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(order.status)}</span>{order.payment_dispute_status === "reported" && <span className="pill border-red-200 bg-red-50 text-red-800">Payment disputed</span>}{order.payment_dispute_status === "resolved" && <span className="pill border-emerald-200 bg-emerald-50 text-emerald-800">Dispute resolved</span>}</div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-5"><p className="eyebrow">Exact vendor-confirmed amount</p><p className="mt-2 font-serif text-3xl font-semibold text-jade-950">{amount != null ? formatAed(Number(amount)) : "Not confirmed"}</p>{order.vendor_confirmed_price_aed != null && estimate != null && <p className="mt-1 text-xs text-ink-muted">Original request estimate {formatAed(Number(estimate))}</p>}</div>
        <div className="card p-5"><p className="eyebrow">Payment method</p><p className="mt-2 font-semibold text-jade-950">{methodLabel(order.payment_method)}</p><p className="mt-1 text-xs text-ink-muted">{statusLabel(order.payment_status)}</p></div>
        <div className="card p-5"><p className="eyebrow">Parties</p><p className="mt-2 text-sm"><strong>{customer?.full_name ?? "Customer"}</strong> → <strong>{vendor?.business_name ?? "Vendor"}</strong></p><p className="mt-1 text-xs text-ink-muted">Quantity {order.quantity}</p></div>
      </div>

      {(submittedLate || paymentOverdue || verificationDelayed || confirmationDelayed) && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Timing attention:</strong> {submittedLate ? "Customer submission was recorded after the preserved payment deadline." : paymentOverdue ? "The payment window expired without a customer submission." : verificationDelayed ? "The vendor has not confirmed the customer’s payment claim after 24 hours." : "Vendor confirmation took more than 24 hours."}</div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h3 className="font-serif text-xl font-semibold text-jade-950">Payment evidence and timing</h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Price confirmed</dt><dd className="mt-1 font-medium">{formatDubaiDateTime(order.vendor_price_confirmed_at)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Customer accepted</dt><dd className="mt-1 font-medium">{formatDubaiDateTime(order.customer_price_accepted_at)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Payment deadline</dt><dd className="mt-1 font-medium">{formatDubaiDateTime(order.payment_window_expires_at)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Customer marked sent</dt><dd className="mt-1 font-medium">{formatDubaiDateTime(order.transfer_submitted_at)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Transaction reference</dt><dd className="mt-1 break-all font-medium">{order.transfer_reference || "Not supplied"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Optional customer proof</dt><dd className="mt-1">{order.transfer_proof_path ? <a href={`/api/reservations/bank-proof?id=${order.id}`} className="font-semibold text-jade-700 underline">Open private evidence</a> : "Not supplied"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Vendor confirmed receipt</dt><dd className="mt-1 font-medium">{formatDubaiDateTime(order.payment_confirmed_at)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Confirmation delay</dt><dd className="mt-1 font-medium">{confirmationTime ?? "Not available"}</dd></div>
          </dl>
          <div className="mt-5 rounded-xl bg-bone-soft p-4 text-sm"><p className="font-semibold text-jade-950">Confirming vendor account</p><p className="mt-1">{order.payment_confirmed_by ? `${confirmer?.full_name ?? "Vendor user"}${confirmerAuth.data.user?.email ? ` · ${confirmerAuth.data.user.email}` : ""}` : "Not confirmed yet"}</p>{order.payment_confirmed_by && <p className="mt-1 break-all text-xs text-ink-muted">User ID: {order.payment_confirmed_by}</p>}</div>
        </section>

        <section className="card p-5">
          <h3 className="font-serif text-xl font-semibold text-jade-950">Dispute control</h3>
          <p className="mt-2 text-sm text-ink-muted">A dispute marker alerts operations; it does not reverse or prove payment.</p>
          {order.payment_dispute_note && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm"><strong>Reason:</strong> {order.payment_dispute_note}</div>}
          {order.payment_dispute_resolution_note && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><strong>Resolution:</strong> {order.payment_dispute_resolution_note}</div>}
          <div className="mt-4"><AdminPaymentDisputeActions reservationId={order.id} status={order.payment_dispute_status} /></div>
        </section>
      </div>

      <section className="card mt-5 p-5">
        <h3 className="font-serif text-xl font-semibold text-jade-950">Immutable activity trail</h3>
        <div className="mt-4 space-y-3">
          {(audit ?? []).map((entry) => {
            const actor = entry.actor as unknown as { full_name: string | null } | null;
            return <div key={entry.id} className="flex flex-col justify-between gap-1 border-b border-bone-deep pb-3 text-sm sm:flex-row"><span><strong>{statusLabel(entry.action.replace("reservation.", ""))}</strong> · {actor?.full_name ?? statusLabel(entry.actor_role ?? "system")}</span><span className="text-xs text-ink-muted">{formatDubaiDateTime(entry.created_at)}</span></div>;
          })}
          {(audit ?? []).length === 0 && <p className="text-sm text-ink-muted">No payment actions have been recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
