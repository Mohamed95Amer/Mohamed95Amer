import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductCard } from "@/components/ProductCard";
import { SavedItemActions } from "@/components/SavedItemActions";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { reputationMap, type VendorReputationRow } from "@/lib/reputation";
import { formatAed } from "@/lib/pricing/calc";
import { applyEventDeliveryDiscount } from "@/lib/marketing";
import { dubaiTodayIso } from "@/lib/time";
import { getCustomerFeeOffer } from "@/lib/pricing/customer-fee";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await requireUser(); const admin = getServiceSupabase();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const feeOffer = await getCustomerFeeOffer(user.id);
  const [{ data: favourites }, { data: alerts }, { data: settings }, { data: reputationRows }] = await Promise.all([
    admin.from("product_favourites").select("product_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("price_alerts").select("product_id, target_total_aed, notify_on_making_offer").eq("user_id", user.id).eq("active", true),
    admin.from("platform_settings").select("platform_fee_bps, delivery_fee_aed, listing_fresh_days, demo_data_visible").eq("id", true).maybeSingle(),
    admin.from("vendor_reputation_summary").select("*"),
  ]);
  const ids = (favourites ?? []).map((row) => row.product_id); let productsQuery = ids.length ? admin.from("products").select("id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_premium, vendor_rate_adjustment_per_gram, assay_fineness, vat_rate_bps, quantity, images, vendor_id, vendors!inner(id, business_name, emirate, verification_status, license_expiry_date, is_demo)").in("id", ids).eq("product_status", "approved").eq("data_quality_status", "valid").eq("vendors.verification_status", "approved").gte("vendors.license_expiry_date", dubaiTodayIso()).gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45))) : null;
  if (productsQuery && settings?.demo_data_visible === false) productsQuery = productsQuery.eq("is_demo", false).eq("vendors.is_demo", false);
  const { data: products } = productsQuery ? await productsQuery : { data: [] };
  const alertMap = new Map((alerts ?? []).map((alert) => [alert.product_id, alert])); const reputations = reputationMap(reputationRows as VendorReputationRow[] | null);
  return <main className="container-pro py-10 sm:py-14" dir={arabic ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">{t("Your shortlist", "قائمتك المختارة")}</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">{t("Saved gold & alerts", "الذهب المحفوظ والتنبيهات")}</h1><p className="mt-2 text-sm text-ink-muted">{t("Return to favourites quickly and watch for a target total or making-charge promotion.", "ارجع إلى منتجاتك المفضلة بسرعة وتابع السعر المستهدف أو عروض المصنعية.")}</p></div><Link href="/marketplace" className="btn-primary">{t("Browse gold", "تصفح الذهب")}</Link></div>
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{(products ?? []).map((product, index) => { const rawVendor = product.vendors as any; const vendor = rawVendor ? { ...rawVendor, reputation: reputations.get(rawVendor.id) ?? null } : null; const alert = alertMap.get(product.id); return <div key={product.id}><ProductCard p={{ ...product, available: product.quantity, vendor }} platformFeeBps={feeOffer.effectiveBps} customerFeeDiscountPercent={feeOffer.discountPercent} eventFeeDiscountPercent={feeOffer.eventDiscountPercent} eventPromotionTitle={feeOffer.eventPromotionTitle} deliveryFee={applyEventDeliveryDiscount(Number(settings?.delivery_fee_aed ?? 0), feeOffer.eventDeliveryDiscountPercent)} priority={index === 0} arabic={arabic} />{alert && <p className="mt-2 text-xs text-ink-muted">{t("Alert:", "تنبيه:")} {alert.target_total_aed ? `${t("at", "عند")} ${formatAed(alert.target_total_aed)}` : t("making offers", "عروض المصنعية")}{alert.target_total_aed && alert.notify_on_making_offer ? t(" + making offers", " + عروض المصنعية") : ""}</p>}<SavedItemActions productId={product.id} hasAlert={Boolean(alert)} arabic={arabic} /></div>; })}{(products ?? []).length === 0 && <div className="card col-span-full p-8 text-center"><h2 className="font-serif text-2xl text-jade-950">{t("Your shortlist is empty", "قائمتك المحفوظة فارغة")}</h2><p className="mt-2 text-sm text-ink-muted">{t("Save products from their detail page to watch and compare them.", "احفظ المنتجات من صفحاتها لمتابعتها ومقارنتها.")}</p></div>}</div>
  </main>;
}
