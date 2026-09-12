import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { VendorOfferForm } from "@/components/VendorOfferForm";
import { formatAed } from "@/lib/pricing/calc";

export const dynamic = "force-dynamic";

export default async function VendorBuyerRequestsPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id, verification_status").eq("owner_user_id", user.id).maybeSingle();
  if (!vendor) redirect("/vendor/register");
  if (vendor.verification_status !== "approved") {
    return <main className="container-pro py-10"><h1 className="font-serif text-3xl text-jade-950">Buyer requests</h1><p className="mt-1 text-sm text-ink-muted">Respond to real buyer intent without maintaining an enormous catalogue.</p><VendorNav /><p className="card mt-6 p-5 text-signal-warn">Admin approval is required before you can view buyer requests or send offers.</p></main>;
  }
  const [{ data: requests }, { data: ownOffers }] = await Promise.all([
    admin.from("buyer_requests").select("*").eq("status", "open").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(30),
    admin.from("buyer_request_offers").select("*").eq("vendor_id", vendor.id),
  ]);
  const offersByRequest = new Map((ownOffers ?? []).map((offer) => [offer.buyer_request_id, offer]));
  const rows = await Promise.all((requests ?? []).map(async (request) => ({ ...request, referenceUrl: request.reference_image_path ? (await admin.storage.from("buyer-request-images").createSignedUrl(request.reference_image_path, 3600)).data?.signedUrl ?? null : null })));
  return <main className="container-pro py-10"><h1 className="font-serif text-3xl text-jade-950">Buyer requests</h1><p className="mt-1 text-sm text-ink-muted">Respond to real buyer intent without maintaining an enormous catalogue.</p><VendorNav /><div className="mt-6 grid gap-5 lg:grid-cols-2">{rows.map((request) => { const existing = offersByRequest.get(request.id); return <article key={request.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-jade-600">{request.karat}K · {request.category}</p><h2 className="mt-1 font-serif text-2xl text-jade-950">{request.emirate}</h2></div><span className="font-semibold text-jade-950">{formatAed(request.budget_min_aed)}–{formatAed(request.budget_max_aed)}</span></div>{request.referenceUrl && <a href={request.referenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-jade-700 underline">View private reference image</a>}<p className="mt-3 text-sm leading-relaxed text-ink-muted">{request.description}</p><p className="mt-2 text-xs text-ink-muted">{request.needed_by ? `Needed by ${request.needed_by}` : "No fixed deadline"}</p><VendorOfferForm requestId={request.id} existing={existing} /></article>; })}{rows.length === 0 && <p className="card p-6 text-ink-muted">No open buyer requests right now.</p>}</div></main>;
}
