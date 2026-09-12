import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { CatalogueSupportForm } from "@/components/CatalogueSupportForm";
import { statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function VendorCatalogueSupportPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!vendor) redirect("/vendor/register");
  const { data: requests } = await admin.from("catalogue_support_requests").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false });
  const active = (requests ?? []).find((request) => ["requested", "scheduled", "in_progress"].includes(request.status));
  return <main className="container-pro py-10"><h1 className="font-serif text-3xl text-jade-950">Managed catalogue launch</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">Send the business information and product material you already have. Get Gold can prepare your first 10–20 accurate listings instead of making your team learn another catalogue system.</p><VendorNav />{active ? <div className="card mt-6 p-6"><p className="eyebrow text-jade-600">Active request</p><h2 className="mt-1 font-serif text-2xl text-jade-950">{active.target_listing_count} launch listings · {statusLabel(active.status)}</h2><p className="mt-2 text-sm text-ink-muted">{active.admin_note || "Our onboarding team will review the request and arrange the next step."}</p></div> : <CatalogueSupportForm />}{(requests ?? []).length > 0 && <div className="card mt-6 p-6"><h2 className="font-serif text-xl text-jade-950">Request history</h2><ul className="mt-3 divide-y divide-jade-900/10 text-sm">{(requests ?? []).map((request) => <li key={request.id} className="flex justify-between gap-4 py-3"><span>{request.target_listing_count} products</span><span className="text-ink-muted">{statusLabel(request.status)}</span></li>)}</ul></div>}</main>;
}
