import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";
import { AcceptOfferButton } from "@/components/AcceptOfferButton";

export const dynamic = "force-dynamic";

export default async function AccountRequestsPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: requests } = await admin.from("buyer_requests").select("*, offers:buyer_request_offers(*, vendor:vendors(business_name, emirate, verification_status), product:products(id, name, karat, weight_grams))").eq("customer_user_id", user.id).order("created_at", { ascending: false });
  return (
    <main className="container-pro py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">Your demand</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">Gold requests & offers</h1></div><Link href="/requests/new" className="btn-primary">+ New request</Link></div>
      <div className="mt-8 space-y-5">
        {(requests ?? []).map((request) => (
          <article key={request.id} className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-jade-600">{request.karat}K · {request.category} · {request.emirate}</p><h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">{formatAed(request.budget_min_aed)}–{formatAed(request.budget_max_aed)}</h2></div><span className="pill border-jade-900/10 bg-jade-50">{statusLabel(request.status)}</span></div>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">{request.description}</p>
            <p className="mt-2 text-xs text-ink-muted">Submitted {formatDubaiDateTime(request.created_at)}{request.needed_by ? ` · Needed by ${request.needed_by}` : ""}</p>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {(request.offers ?? []).map((offer: any) => {
                const vendor = Array.isArray(offer.vendor) ? offer.vendor[0] : offer.vendor;
                const product = Array.isArray(offer.product) ? offer.product[0] : offer.product;
                return <div key={offer.id} className={`rounded-2xl border p-4 ${offer.status === "accepted" ? "border-signal-ok/40 bg-signal-ok/5" : "border-jade-900/10 bg-bone-soft"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-jade-950">{vendor?.business_name ?? "Verified store"}</p><p className="text-xs text-ink-muted">{vendor?.emirate} · {offer.estimated_days} days</p></div><p className="font-serif text-xl font-semibold text-jade-950">{formatAed(offer.total_price_aed)}</p></div>{product && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-jade-700">Ready listing: {product.name} · {product.karat}K · {product.weight_grams}g</p>}<p className="mt-2 text-xs text-ink-muted">Making {formatAed(offer.making_charge_aed)} · Certificate {formatAed(offer.certificate_fee_aed)} · {offer.supports_delivery ? "Delivery available" : "Collection only"}</p><p className="mt-2 text-sm text-ink-muted">{offer.note}</p><div className="mt-3">{request.status === "open" && offer.status === "submitted" ? <AcceptOfferButton offerId={offer.id} /> : offer.status === "accepted" && product ? <div><Link href={`/products/${product.id}`} className="btn-primary px-4 py-2 text-xs">Review live price & checkout</Link><p className="mt-2 text-[11px] text-ink-muted">The listing’s live server price—not the earlier indicative offer—is locked at checkout.</p></div> : <span className="text-xs font-semibold text-jade-700">{statusLabel(offer.status)}</span>}</div></div>;
              })}
              {(request.offers ?? []).length === 0 && <p className="rounded-xl bg-jade-50 p-4 text-sm text-ink-muted">No offers yet. Verified stores can respond while this request is open.</p>}
            </div>
          </article>
        ))}
        {(requests ?? []).length === 0 && <div className="card p-8 text-center"><h2 className="font-serif text-2xl text-jade-950">No requests yet</h2><p className="mt-2 text-sm text-ink-muted">Tell local stores what you want instead of searching every catalogue.</p><Link href="/requests/new" className="btn-primary mt-5">Create your first request</Link></div>}
      </div>
    </main>
  );
}
