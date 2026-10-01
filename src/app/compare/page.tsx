import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CompareResults } from "@/components/CompareResults";
import { getCurrentProfile } from "@/lib/auth/server";
import { type CompareCriteria, type CompareListing } from "@/lib/compare/selection";
import { applyEventDeliveryDiscount } from "@/lib/marketing";
import { getCustomerFeeOffer } from "@/lib/pricing/customer-fee";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { getServiceSupabase } from "@/lib/supabase/server";
import { dubaiTodayIso } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "GetGold Compare",
  description: "Compare gold pieces from up to four UAE stores by final price or making charge.",
  alternates: { canonical: "/compare" },
};

const categories = ["bracelet", "cuff", "bangle", "ring", "necklace", "earring", "set", "chain", "pendant", "bar", "coin", "other"] as const;
const karats = [24, 22, 21, 18, 16, 14, 12] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const selectColumns = "id, vendor_id, name, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, stone_value, vendor_rate_adjustment_per_gram, assay_fineness, vat_rate_bps, images, vendors!inner(id, business_name, emirate, verification_status, license_expiry_date, is_demo)";
type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function parseCriteria(raw: Search): CompareCriteria | null {
  const category = one(raw.category);
  const karat = Number(one(raw.karat));
  const minWeight = Number(one(raw.minWeight));
  const maxWeight = Number(one(raw.maxWeight));
  const budget = Number(one(raw.budget));
  if (!categories.some((value) => value === category) || !karats.some((value) => value === karat)
    || !Number.isFinite(minWeight) || !Number.isFinite(maxWeight) || !Number.isFinite(budget)
    || minWeight < 0.1 || maxWeight > 1000 || minWeight > maxWeight || budget < 1 || budget > 1_000_000) return null;
  return {
    category, karat, minWeight, maxWeight, budget,
    sort: one(raw.sort) === "making" ? "making" : "total",
    fulfilment: one(raw.fulfilment) === "pickup" ? "pickup" : "delivery",
  };
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const ids = [...new Set(one(raw.ids).split(",").filter((id) => uuid.test(id)))].slice(0, 4);
  const manual = raw.ids !== undefined;
  const attemptedSmartSearch = !manual && ["category", "karat", "minWeight", "maxWeight", "budget"].some((key) => raw[key] !== undefined);
  const criteria = attemptedSmartSearch ? parseCriteria(raw) : null;
  let error = attemptedSmartSearch && !criteria
    ? (arabic ? "اختر فئة وعيارًا ووزنًا صحيحًا، وتأكد أن الحد الأدنى لا يتجاوز الأعلى والميزانية أكبر من صفر." : "Choose a category, karat, valid weight range and a budget above zero.")
    : null;

  const t = arabic ? {
    eyebrow: "مقارنة ذكية بين المتاجر", title: "GetGold Compare",
    description: "اختَر مواصفات القطعة، وشاهد حتى 4 منتجات من 4 متاجر مختلفة، مرتبة بالسعر النهائي أو المصنعية.",
    category: "نوع القطعة", karat: "العيار", min: "أقل وزن (غرام)", max: "أعلى وزن (غرام)",
    budget: "أقصى ميزانية (درهم)", sort: "الترتيب", fulfilment: "طريقة الاستلام",
    delivery: "توصيل - مع الرسوم", pickup: "استلام من المتجر - بدون توصيل",
    total: "السعر النهائي الأقل", making: "المصنعية الأقل", action: "قارن الآن", example: "جرّب مثالاً متاحاً: سبائك 24K، 1–20 غرام، 6,000 درهم",
    selected: "مقارنة القطع التي اخترتها", selectedHint: "هذه القطع اختَرتها بنفسك من صفحات المنتجات.",
    how: "كيف نحسب المقارنة؟", howText: "نحسب الذهب بسعر السوق الحالي، ثم نضيف مصنعية كل قطعة بعد الخصم والرسوم والضريبة. رسوم التوصيل حسب المتجر إذا اخترت التوصيل. السعر المعروض تقديري؛ المتجر يؤكد التوفر والسعر النهائي قبل الدفع.",
  } : {
    eyebrow: "Smart cross-store comparison", title: "GetGold Compare",
    description: "Choose the piece, purity, weight and budget. See up to four products from four different stores ranked by final total or making charge.",
    category: "Piece type", karat: "Karat", min: "Minimum weight (g)", max: "Maximum weight (g)",
    budget: "Maximum budget (AED)", sort: "Sort by", fulfilment: "Fulfilment",
    delivery: "Delivery - fees included", pickup: "Store pickup - no delivery fee",
    total: "Lowest final total", making: "Lowest making charge", action: "Compare now", example: "Try: 24K bars, 1–20g, AED 6,000",
    selected: "Your selected comparison", selectedHint: "These are the pieces you chose from product pages.",
    how: "How is this compared?", howText: "We use the current gold reference, then add each piece's discounted making charge, other fees and VAT. Delivery reflects the store's fee when selected. This is an estimate; the shop confirms availability and its final price before payment.",
  };

  let listings: CompareListing[] = [];
  let feeBps = 100;
  let truncated = false;
  let showSampleLink = false;
  if ((manual && ids.length) || criteria) {
    const supabase = getServiceSupabase();
    const profile = await getCurrentProfile();
    const [{ data: settings, error: settingsError }, feeOffer] = await Promise.all([
      supabase.from("platform_settings").select("delivery_fee_aed, listing_fresh_days, demo_data_visible").eq("id", true).maybeSingle(),
      getCustomerFeeOffer(profile?.role === "customer" ? profile.id : null),
    ]);
    feeBps = feeOffer.effectiveBps;
    if (settingsError || !settings) {
      error = arabic ? "تعذّر تحميل إعدادات الأسعار حاليًا. حاول مرة أخرى." : "Pricing settings are temporarily unavailable. Please try again.";
    } else {
      showSampleLink = settings.demo_data_visible === true;
      let query = supabase.from("products").select(selectColumns)
        .eq("product_status", "approved")
        .eq("data_quality_status", "valid")
        .eq("vendors.verification_status", "approved")
        .gte("vendors.license_expiry_date", dubaiTodayIso())
        .gt("quantity", 0)
        .gte("inventory_confirmed_at", listingFreshCutoff(Number(settings.listing_fresh_days ?? 45)));
      if (settings.demo_data_visible !== true) query = query.eq("is_demo", false).eq("vendors.is_demo", false);
      if (manual) {
        query = query.in("id", ids).limit(4);
      } else if (criteria) {
        query = query.eq("category", criteria.category).eq("karat", criteria.karat)
          .gte("weight_grams", criteria.minWeight).lte("weight_grams", criteria.maxWeight)
          .order("created_at", { ascending: false }).limit(500);
      }
      const { data: products, error: productsError } = await query;
      if (productsError) {
        error = arabic ? "تعذّر تحميل المنتجات للمقارنة. حاول مرة أخرى." : "Could not load comparison listings. Please try again.";
      } else {
        truncated = !manual && (products?.length ?? 0) === 500;
        const vendorIds = [...new Set((products ?? []).map((product) => String(product.vendor_id)))];
        const { data: paymentSettings, error: paymentError } = vendorIds.length
          ? await supabase.from("vendor_payment_settings").select("vendor_id, delivery_fee_aed").in("vendor_id", vendorIds)
          : { data: [], error: null };
        if (paymentError) {
          error = arabic ? "تعذّر تحميل رسوم التوصيل الخاصة بالمتاجر." : "Could not load store delivery fees.";
        } else {
          const deliveryByVendor = new Map((paymentSettings ?? [])
            .filter((item) => item.delivery_fee_aed !== null)
            .map((item) => [String(item.vendor_id), Number(item.delivery_fee_aed)]));
          listings = (products ?? []).flatMap((product) => {
            const vendor = Array.isArray(product.vendors) ? product.vendors[0] : product.vendors;
            if (!vendor?.id) return [];
            const beforeDiscount = deliveryByVendor.get(String(product.vendor_id));
            const fee = beforeDiscount ?? Number(settings.delivery_fee_aed ?? 0);
            return [{
              id: String(product.id), name: String(product.name), category: String(product.category),
              karat: Number(product.karat), weight_grams: product.weight_grams,
              making_charge: product.making_charge, making_charge_discount_percent: product.making_charge_discount_percent,
              making_charge_offer_ends_at: product.making_charge_offer_ends_at,
              certificate_fee: product.certificate_fee, stone_value: product.stone_value,
              vendor_rate_adjustment_per_gram: product.vendor_rate_adjustment_per_gram,
              assay_fineness: product.assay_fineness, vat_rate_bps: product.vat_rate_bps,
              images: product.images,
              vendor: { id: String(vendor.id), business_name: String(vendor.business_name), emirate: String(vendor.emirate) },
              deliveryFeeAed: applyEventDeliveryDiscount(fee, feeOffer.eventDeliveryDiscountPercent),
            } satisfies CompareListing];
          });
          if (manual) listings.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        }
      }
    }
  }

  if (!manual && !criteria) {
    const { data: visibility } = await getServiceSupabase()
      .from("platform_settings")
      .select("demo_data_visible")
      .eq("id", true)
      .maybeSingle();
    showSampleLink = visibility?.demo_data_visible === true;
  }

  return <main className="container-pro py-10 sm:py-14" dir={arabic ? "rtl" : "ltr"}>
    <section className="relative overflow-hidden rounded-[1.5rem] bg-jade-950 px-6 py-9 text-white sm:px-10 sm:py-12">
      <div className="absolute -right-14 -top-24 h-72 w-72 rounded-full border border-gold-300/20" aria-hidden="true" />
      <div className="relative max-w-2xl"><p className="eyebrow text-gold-300">{t.eyebrow}</p><h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">{t.title}</h1><p className="mt-3 text-sm leading-7 text-white/75">{t.description}</p></div>
    </section>

    <form action="/compare" method="get" className="card relative -mt-4 grid gap-4 p-5 sm:p-7 md:grid-cols-2 lg:grid-cols-3">
      <div><label className="label" htmlFor="compare-category">{t.category}</label><select id="compare-category" name="category" className="input" defaultValue={one(raw.category)} required><option value="">{arabic ? "اختر النوع" : "Choose a type"}</option>{categories.map((value) => <option key={value} value={value}>{categoryLabel(value, arabic)}</option>)}</select></div>
      <div><label className="label" htmlFor="compare-karat">{t.karat}</label><select id="compare-karat" name="karat" className="input" defaultValue={one(raw.karat)} required><option value="">{arabic ? "اختر العيار" : "Choose karat"}</option>{karats.map((value) => <option key={value} value={value}>{value}K</option>)}</select></div>
      <div><label className="label" htmlFor="compare-budget">{t.budget}</label><input id="compare-budget" name="budget" className="input" type="number" min="1" max="1000000" step="1" placeholder="2500" defaultValue={one(raw.budget)} required /></div>
      <div><label className="label" htmlFor="compare-min">{t.min}</label><input id="compare-min" name="minWeight" className="input" type="number" min="0.1" max="1000" step="0.01" placeholder="5" defaultValue={one(raw.minWeight)} required /></div>
      <div><label className="label" htmlFor="compare-max">{t.max}</label><input id="compare-max" name="maxWeight" className="input" type="number" min="0.1" max="1000" step="0.01" placeholder="7" defaultValue={one(raw.maxWeight)} required /></div>
      <div><label className="label" htmlFor="compare-sort">{t.sort}</label><select id="compare-sort" name="sort" className="input" defaultValue={one(raw.sort) === "making" ? "making" : "total"}><option value="total">{t.total}</option><option value="making">{t.making}</option></select></div>
      <div className="md:col-span-2 lg:col-span-2"><label className="label" htmlFor="compare-fulfilment">{t.fulfilment}</label><select id="compare-fulfilment" name="fulfilment" className="input" defaultValue={one(raw.fulfilment) === "pickup" ? "pickup" : "delivery"}><option value="delivery">{t.delivery}</option><option value="pickup">{t.pickup}</option></select></div>
      <div className="flex items-end"><button className="btn-primary w-full">{t.action}</button></div>
      {showSampleLink && <Link href="/compare?category=bar&karat=24&minWeight=1&maxWeight=20&budget=6000&sort=total&fulfilment=pickup" className="text-xs font-semibold text-jade-700 underline underline-offset-4 md:col-span-2 lg:col-span-3">{t.example}</Link>}
    </form>

    {error && <div role="alert" className="mt-6 rounded-xl border border-signal-err/25 bg-signal-err/5 p-5 text-sm text-signal-err">{error}</div>}
    {!error && manual && <section className="mt-9"><h2 className="font-serif text-2xl text-jade-950">{t.selected}</h2><p className="mt-1 text-sm text-ink-muted">{t.selectedHint}</p><CompareResults mode="manual" listings={listings} feeBps={feeBps} selectedIds={ids} arabic={arabic} /></section>}
    {!error && criteria && <CompareResults mode="smart" listings={listings} feeBps={feeBps} criteria={criteria} arabic={arabic} truncated={truncated} />}
    {!manual && !attemptedSmartSearch && <div className="card mt-8 p-6 sm:p-8"><p className="font-serif text-xl text-jade-950">{arabic ? "ابدأ بمواصفات القطعة التي تبحث عنها." : "Start with the piece you have in mind."}</p><p className="mt-2 text-sm text-ink-muted">{arabic ? "سنختار أفضل نتيجة مطابقة من كل متجر، حتى 4 متاجر مختلفة." : "We'll find the best matching piece from each store, across up to four different shops."}</p></div>}
    <details className="mt-8 rounded-xl border border-jade-900/10 bg-bone-soft p-5 text-sm text-ink-muted"><summary className="cursor-pointer font-semibold text-jade-950">{t.how}</summary><p className="mt-3 leading-7">{t.howText}</p></details>
  </main>;
}

function categoryLabel(category: string, arabic: boolean): string {
  const labels: Record<string, [string, string]> = {
    bracelet: ["Bracelets", "أساور"], cuff: ["Cuffs", "كف"], bangle: ["Bangles", "أساور صلبة"], ring: ["Rings", "خواتم"],
    necklace: ["Necklaces", "قلائد"], earring: ["Earrings", "أقراط"], set: ["Jewellery sets", "طقم"], chain: ["Chains", "سلاسل"],
    pendant: ["Pendants", "دلايات"], bar: ["Gold bars / ingots", "سبائك الذهب (Ingots)"], coin: ["Gold coins", "عملات ذهبية"], other: ["Other", "أخرى"],
  };
  return labels[category]?.[arabic ? 1 : 0] ?? category;
}
