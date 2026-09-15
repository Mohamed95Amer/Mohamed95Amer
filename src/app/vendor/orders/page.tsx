import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { VendorOrderActions } from "./VendorOrderActions";
import { VendorNav } from "@/components/VendorNav";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { FulfilmentDetails } from "@/components/FulfilmentDetails";
import { Fragment } from "react";
import { StoreVisitActions } from "@/components/StoreVisitActions";
import { DeliveryAssignmentControl } from "@/components/DeliveryAssignmentControl";
import { dubaiTodayIso } from "@/lib/time";
import { VendorOrderProgress } from "@/components/VendorOrderProgress";

export const dynamic = "force-dynamic";

export default async function VendorOrdersPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const [{ data: orders }, { data: visits }] = await Promise.all([
    admin
      .from("reservations")
      .select(
        "id, status, quantity, expires_at, created_at, identity_verification_id, fulfilment_method, payment_method, payment_status, recipient_name, recipient_phone, delivery_emirate, delivery_area, delivery_address_line_1, delivery_address_line_2, delivery_landmark, delivery_latitude, delivery_longitude, delivery_map_link, customer_note, customer:profiles(full_name), product:products(name, karat, weight_grams), snapshot:order_price_snapshots(total_price_aed, platform_fee, platform_fee_bps, customer_fee_discount_percent, service_fee_event_discount_percent, delivery_fee, delivery_fee_before_event_discount, delivery_event_discount_percent, marketplace_promotion_title, quantity)",
      )
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false }),
    admin
      .from("store_visit_requests")
      .select("id, status, preferred_at, phone, note, customer:profiles(full_name), product:products(name, karat, weight_grams)")
      .eq("vendor_id", vendor.id)
      .order("preferred_at", { ascending: true }),
  ]);
  const orderIds = (orders ?? []).map((order) => order.id);
  const [{ data: assignments }, { data: deliveryCompanies }] = await Promise.all([
    orderIds.length
      ? admin.from("delivery_assignments").select("id, reservation_id, delivery_company_id, status, tracking_code, company:delivery_companies(company_name)").in("reservation_id", orderIds)
      : Promise.resolve({ data: [] as any[] }),
    admin.from("delivery_companies").select("id, company_name, emirates_served").eq("verification_status", "approved").gte("license_expiry_date", dubaiTodayIso()).order("company_name"),
  ]);
  const assignmentByReservation = new Map((assignments ?? []).map((assignment) => [assignment.reservation_id, { ...assignment, company: Array.isArray(assignment.company) ? assignment.company[0] : assignment.company }]));

  return (
    <div className="container-pro py-10">
      <h1 className="font-serif text-3xl">Orders</h1>
      <p className="text-sm text-ink-muted">Confirm or reject reservations before payment is requested.</p>
      <VendorNav />
      <section className="mt-6">
        <div className="flex items-end justify-between gap-3"><div><p className="eyebrow text-jade-600">Qualified local leads</p><h2 className="mt-1 font-serif text-2xl text-jade-950">Store visit requests</h2></div><span className="text-xs text-ink-muted">No stock or price is held</span></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {(visits ?? []).map((visit) => {
            const product = visit.product as unknown as { name: string; karat: number; weight_grams: number } | null;
            const customer = visit.customer as unknown as { full_name: string | null } | null;
            return <article key={visit.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-xl text-jade-950">{product?.name}</h3><p className="text-sm text-ink-muted">{customer?.full_name ?? "Customer"} · {visit.phone}</p></div><span className="pill border-jade-900/10 bg-jade-50">{statusLabel(visit.status)}</span></div><p className="mt-3 text-sm"><strong>Preferred:</strong> {formatDubaiDateTime(visit.preferred_at)}</p>{visit.note && <p className="mt-2 text-sm text-ink-muted">{visit.note}</p>}<div className="mt-4"><StoreVisitActions visitId={visit.id} status={visit.status} /></div></article>;
          })}
          {(visits ?? []).length === 0 && <p className="card p-5 text-sm text-ink-muted">No store visit requests yet.</p>}
        </div>
      </section>
      <div className="card mt-6 overflow-x-auto">
        <table className="min-w-[940px] w-full text-sm">
          <thead className="bg-bone-soft text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Expires</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const product = o.product as unknown as { name: string; karat: number; weight_grams: number } | null;
              const customer = o.customer as unknown as { full_name: string | null } | null;
              const snap = o.snapshot as unknown as Array<{ total_price_aed: number; platform_fee: number; platform_fee_bps: number; customer_fee_discount_percent: number | null; service_fee_event_discount_percent: number; delivery_fee: number; delivery_fee_before_event_discount: number | null; delivery_event_discount_percent: number; marketplace_promotion_title: string | null; quantity: number }> | { total_price_aed: number; platform_fee: number; platform_fee_bps: number; customer_fee_discount_percent: number | null; service_fee_event_discount_percent: number; delivery_fee: number; delivery_fee_before_event_discount: number | null; delivery_event_discount_percent: number; marketplace_promotion_title: string | null; quantity: number } | null;
              const total = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
              const priceSnapshot = Array.isArray(snap) ? snap[0] : snap;
              const customerServiceFee = Number(priceSnapshot?.platform_fee ?? 0) * Number(priceSnapshot?.quantity ?? o.quantity);
              const deliverySubsidy = Math.max(0, Number(priceSnapshot?.delivery_fee_before_event_discount ?? priceSnapshot?.delivery_fee ?? 0) - Number(priceSnapshot?.delivery_fee ?? 0));
              const netSettlement = customerServiceFee - deliverySubsidy;
              return (
                <Fragment key={o.id}>
                <tr className="border-t border-bone-deep">
                  <td className="px-4 py-2">{customer?.full_name ?? "—"}</td>
                  <td className="px-4 py-2">{product?.name} · {product?.karat}K · {product?.weight_grams}g</td>
                  <td className="px-4 py-2 text-right">{o.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatAed(total)}</td>
                  <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(o.status)}</span></td>
                  <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(o.expires_at)}</td>
                  <td className="px-4 py-2 text-right">
                    {o.status === "pending_vendor_confirmation" && (
                      <VendorOrderActions reservationId={o.id} />
                    )}
                  </td>
                </tr>
                <tr className="bg-jade-50/50">
                  <td colSpan={7} className="px-4 py-3">
                    <p className={`mb-2 text-xs font-semibold ${o.identity_verification_id ? "text-signal-ok" : "text-ink-muted"}`}>{o.identity_verification_id ? "✓ Identity verified for this order" : "Legacy order · no per-order identity record"}</p>
                    <p className="mb-2 text-xs text-ink-muted">Payment: {o.payment_method === "pay_online" ? "online requested" : "paid directly to store"} · {statusLabel(o.payment_status)}</p>
                    {customerServiceFee > 0 && <p className="mb-2 text-xs text-gold-700"><strong>{formatAed(customerServiceFee)} Get Gold customer fee included.</strong> You collect it inside the displayed total for later settlement to Get Gold; it is not a commission on your making charge.</p>}
                    {Number(priceSnapshot?.service_fee_event_discount_percent ?? 0) > 0 && <p className="mb-2 text-xs text-signal-ok">Applied marketplace offer: {priceSnapshot?.marketplace_promotion_title ?? "seasonal campaign"} · {priceSnapshot?.service_fee_event_discount_percent}% off the Get Gold fee.</p>}
                    {deliverySubsidy > 0 && <p className="mb-2 text-xs text-signal-ok"><strong>{formatAed(deliverySubsidy)} Get Gold-funded delivery credit.</strong> The customer paid the discounted delivery amount; include this credit when reconciling the order. Net amount due to Get Gold for this order: {formatAed(netSettlement)}.</p>}
                    {o.payment_method === "bank_transfer" && <p className="my-2 text-xs">Bank transfer: <a className="underline" href={`/api/reservations/bank-proof?id=${o.id}`}>View submitted proof</a>. Check cleared funds in your bank; a receipt alone is not confirmation.</p>}
                    {o.status === "payment_pending" && ["pay_at_store", "bank_transfer", "cash", "card"].includes(o.payment_method) && <VendorOrderProgress reservationId={o.id} />}
                    <FulfilmentDetails details={o} compact />
                    {o.fulfilment_method === "delivery" && ["payment_pending", "payment_link_pending", "paid"].includes(o.status) && (
                      <div className="mt-3 border-t border-jade-900/10 pt-3"><DeliveryAssignmentControl reservationId={o.id} emirate={o.delivery_emirate} companies={deliveryCompanies ?? []} assignment={assignmentByReservation.get(o.id) as any} /></div>
                    )}
                  </td>
                </tr>
                </Fragment>
              );
            })}
            {(orders ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted">No orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
