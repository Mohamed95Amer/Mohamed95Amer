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
        "id, status, quantity, expires_at, created_at, vendor_action_available_at, submitted_during_working_hours, vendor_confirmed_price_aed, vendor_price_confirmed_at, transfer_proof_path, transfer_reference, transfer_submitted_at, identity_verification_id, fulfilment_method, payment_method, payment_status, recipient_name, recipient_phone, delivery_emirate, delivery_area, delivery_address_line_1, delivery_address_line_2, delivery_landmark, delivery_latitude, delivery_longitude, delivery_map_link, customer_note, customer:profiles(full_name), product:products(name, karat, weight_grams), snapshot:order_price_snapshots(total_price_aed, platform_fee, platform_fee_bps, customer_fee_discount_percent, service_fee_event_discount_percent, delivery_fee, delivery_fee_before_event_discount, delivery_event_discount_percent, marketplace_promotion_title, vendor_rate_adjustment_aed, vat_rate_bps, vat_aed, quantity)",
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
              type PriceSnapshot = { total_price_aed: number; platform_fee: number; platform_fee_bps: number; customer_fee_discount_percent: number | null; service_fee_event_discount_percent: number; delivery_fee: number; delivery_fee_before_event_discount: number | null; delivery_event_discount_percent: number; marketplace_promotion_title: string | null; vendor_rate_adjustment_aed: number | null; vat_rate_bps: number; vat_aed: number; quantity: number };
              const snap = o.snapshot as unknown as PriceSnapshot[] | PriceSnapshot | null;
              const estimatedTotal = Array.isArray(snap) ? snap[0]?.total_price_aed : snap?.total_price_aed;
              const total = o.vendor_confirmed_price_aed ?? estimatedTotal;
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
                  <td className="px-4 py-2 text-right">{formatAed(total)}<span className="block text-[10px] text-ink-muted">{Number(priceSnapshot?.vat_rate_bps ?? 0) > 0 ? `${formatAed(Number(priceSnapshot?.vat_aed ?? 0))} VAT included` : "VAT not charged"}</span>{Number(priceSnapshot?.vendor_rate_adjustment_aed ?? 0) > 0 && <span className="block text-[10px] text-ink-muted">{formatAed(Number(priceSnapshot?.vendor_rate_adjustment_aed))} store rate adj.</span>}</td>
                  <td className="px-4 py-2"><span className="pill border-bone-deep bg-bone-soft">{statusLabel(o.status)}</span></td>
                  <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(o.expires_at)}</td>
                  <td className="px-4 py-2 text-right">
                    {o.status === "pending_vendor_confirmation" && (
                      <VendorOrderActions reservationId={o.id} estimatedTotalAed={Number(estimatedTotal ?? 0)} availableAt={o.vendor_action_available_at} />
                    )}
                  </td>
                </tr>
                <tr className="bg-jade-50/50">
                  <td colSpan={7} className="px-4 py-3">
                    <p className={`mb-2 text-xs font-semibold ${o.identity_verification_id ? "text-signal-ok" : "text-ink-muted"}`}>{o.identity_verification_id ? "✓ Identity verified for this order" : "Legacy order · no per-order identity record"}</p>
                    <p className="mb-2 text-xs text-ink-muted">Payment: {o.payment_method === "aani" ? "Aani direct to store" : o.payment_method === "bank_transfer" ? "bank transfer direct to store" : o.payment_method === "pay_online" ? "online requested" : "paid directly to store"} · {statusLabel(o.payment_status)}</p>
                    {!o.submitted_during_working_hours && o.status === "pending_vendor_confirmation" && <p className="mb-2 text-xs font-medium text-gold-700">Submitted while closed · vendor action opens {formatDubaiDateTime(o.vendor_action_available_at)}</p>}
                    {o.vendor_confirmed_price_aed != null && Number(o.vendor_confirmed_price_aed) !== Number(estimatedTotal) && <p className="mb-2 text-xs text-gold-700">Vendor-confirmed final total: <strong>{formatAed(Number(o.vendor_confirmed_price_aed))}</strong> · request estimate was {formatAed(Number(estimatedTotal))}</p>}
                    {Number(priceSnapshot?.vat_rate_bps ?? 0) > 0 && <p className="mb-2 text-xs text-ink-muted">VAT included in the customer total: <strong>{formatAed(Number(priceSnapshot?.vat_aed ?? 0))}</strong> at {Number(priceSnapshot?.vat_rate_bps ?? 0) / 100}%.</p>}
                    {customerServiceFee > 0 && <p className="mb-2 text-xs text-gold-700"><strong>{formatAed(customerServiceFee)} Get Gold customer fee included.</strong> You collect it inside the displayed total for later settlement to Get Gold; it is not a commission on your making charge.</p>}
                    {Number(priceSnapshot?.service_fee_event_discount_percent ?? 0) > 0 && <p className="mb-2 text-xs text-signal-ok">Applied marketplace offer: {priceSnapshot?.marketplace_promotion_title ?? "seasonal campaign"} · {priceSnapshot?.service_fee_event_discount_percent}% off the Get Gold fee.</p>}
                    {deliverySubsidy > 0 && <p className="mb-2 text-xs text-signal-ok"><strong>{formatAed(deliverySubsidy)} Get Gold-funded delivery credit.</strong> The customer paid the discounted delivery amount; include this credit when reconciling the order. Net amount due to Get Gold for this order: {formatAed(netSettlement)}.</p>}
                    {["bank_transfer", "aani"].includes(o.payment_method) && o.transfer_submitted_at && <p className="my-2 text-xs">Customer marked payment as sent{o.transfer_reference ? ` · reference ${o.transfer_reference}` : ""}. {o.transfer_proof_path && <a className="underline" href={`/api/reservations/bank-proof?id=${o.id}`}>View optional screenshot</a>} Check cleared funds in your own account; customer evidence alone is not confirmation.</p>}
                    {["payment_pending", "payment_verification", "payment_confirmed", "preparing_order", "ready_for_delivery", "out_for_delivery", "delivered"].includes(o.status) && <VendorOrderProgress reservationId={o.id} status={o.status} paymentMethod={o.payment_method} fulfilmentMethod={o.fulfilment_method} />}
                    <FulfilmentDetails details={o} compact />
                    {o.fulfilment_method === "delivery" && ["payment_confirmed", "preparing_order", "ready_for_delivery", "out_for_delivery", "delivered", "completed", "paid"].includes(o.status) && (
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
