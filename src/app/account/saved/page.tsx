import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductCard } from "@/components/ProductCard";
import { SavedItemActions } from "@/components/SavedItemActions";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";
import { formatAed } from "@/lib/pricing/calc";
import { dubaiTodayIso } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await requireUser(); const admin = getServiceSupabase();
  const [{ data: favourites }, { data: alerts }, { data: settings }, { data: reputationRows }] = await Promise.all([
    admin.from("product_favourites").select("product_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("price_alerts").select("product_id, target_total_aed, notify_on_making_offer").eq("user_id", user.id).eq("active", true),
    admin.from("platform_settings").select("platform_fee_bps, delivery_fee_aed, listing_fresh_days").eq("id", true).maybeSingle(),
    admin.from("vendor_reputation_summary").select("*"),
  ]);
  const ids = (favourites ?? []).map((row) => row.product_id); const { data: products } = ids.length ? await admin.from("products").select("id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, quantity, images, vendor_id, vendors!inner(id, business_name, emirate, verification_status, license_expiry_date)").in("id", ids).eq("product_status", "approved").eq("data_quality_status", "valid").eq("vendors.verification_status", "approved").gte("vendors.license_expiry_date", dubaiTodayIso()).gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45))) : { data: [] };
  const alertMap = new Map((alerts ?? []).map((alert) => [alert.product_id, alert])); const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);
  return <main className="container-pro py-10 sm:py-14"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">Your shortlist</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">Saved gold & alerts</h1><p className="mt-2 text-sm text-ink-muted">Return to favourites quickly and watch for a target total or making-charge promotion.</p></div><Link href="/marketplace" className="btn-primary">Browse gold</Link></div><div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{(products ?? []).map((product, index) => { const rawVendor = product.vendors as any; const vendor = rawVendor ? { ...rawVendor, reputation: reputations.get(rawVendor.id) ?? null } : null; const alert = alertMap.get(product.id); return <div key={product.id}><ProductCard p={{ ...product, available: product.quantity, vendor }} platformFeeBps={Number(settings?.platform_fee_bps ?? 50)} deliveryFee={Number(settings?.delivery_fee_aed ?? 0)} priority={index === 0} />{alert && <p className="mt-2 text-xs text-ink-muted">Alert: {alert.target_total_aed ? `at ${formatAed(alert.target_total_aed)}` : "making offers"}{alert.target_total_aed && alert.notify_on_making_offer ? " + making offers" : ""}</p>}<SavedItemActions productId={product.id} hasAlert={Boolean(alert)} /></div>; })}{(products ?? []).length === 0 && <div className="card col-span-full p-8 text-center"><h2 className="font-serif text-2xl text-jade-950">Your shortlist is empty</h2><p className="mt-2 text-sm text-ink-muted">Save products from their detail page to watch and compare them.</p></div>}</div></main>;
}
