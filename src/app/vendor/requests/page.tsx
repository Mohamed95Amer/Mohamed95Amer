import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { VendorOfferForm } from "@/components/VendorOfferForm";
import { formatAed } from "@/lib/pricing/calc";
import { dubaiTodayIso } from "@/lib/time";
import { listingFreshCutoff } from "@/lib/products/integrity";
import { vendorCategories } from "@/lib/vendor-workspace";
export const dynamic = "force-dynamic";
export default async function VendorBuyerRequestsPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin.from("vendors").select("id, verification_status, license_expiry_date").eq("owner_user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load store.");
  if (!vendor) redirect("/vendor/register");
  const header = <><p className="eyebrow text-jade-600">{t("New opportunities", "فرص جديدة")}</p><h1 className="mt-2 font-serif text-3xl sm:text-4xl">{t("Buyer requests", "طلبات العملاء")}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{t("Find buyers looking for pieces you can supply. Open a request to prepare a personal offer.", "اعثر على عملاء يبحثون عن قطع يمكنك توفيرها. افتح الطلب لتجهيز عرض مناسب.")}</p><VendorNav arabic={ar} /></>;
  if (vendor.verification_status !== "approved" || vendor.license_expiry_date < dubaiTodayIso()) return <main className="container-pro py-8 sm:py-10">{header}<p className="card p-5 text-signal-warn">{t("An approved store with a valid trade licence is required to view buyer requests and send offers.", "يلزم اعتماد المتجر وسريان الرخصة التجارية لعرض طلبات العملاء وإرسال العروض.")}</p></main>;
  const { data: settings, error: settingsError } = await admin.from("platform_settings").select("listing_fresh_days").eq("id", true).maybeSingle();
  const [{ data: requests, error: requestError }, { data: ownOffers, error: offerError }, { data: products, error: productError }] = await Promise.all([
    admin.from("buyer_requests").select("*").eq("status", "open").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(30),
    admin.from("buyer_request_offers").select("*").eq("vendor_id", vendor.id),
    admin.from("products").select("id, name, karat, weight_grams").eq("vendor_id", vendor.id).eq("product_status", "approved").eq("data_quality_status", "valid").gt("quantity", 0).gte("inventory_confirmed_at", listingFreshCutoff(Number(settings?.listing_fresh_days ?? 45))).order("name"),
  ]);
  if (settingsError || requestError || offerError || productError) throw new Error("Could not load buyer requests.");
  const offersByRequest = new Map((ownOffers ?? []).map(offer => [offer.buyer_request_id, offer]));
  const rows = await Promise.all((requests ?? []).map(async request => ({ ...request, referenceUrl: request.reference_image_path ? (await admin.storage.from("buyer-request-images").createSignedUrl(request.reference_image_path, 3600)).data?.signedUrl ?? null : null })));
  return <main className="container-pro py-8 sm:py-10">{header}<div className="grid items-start gap-5 lg:grid-cols-2">{rows.map(request => {
    const existing = offersByRequest.get(request.id);
    const category = vendorCategories.find(c => c[0] === request.category);
    return <article key={request.id} className="card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-jade-600">{request.karat}K · {category?.[ar ? 2 : 1] ?? request.category}</p><h2 className="mt-2 font-serif text-2xl">{request.emirate}</h2></div>{existing && <span className="pill border-jade-900/10 bg-jade-50">{t("Offer sent", "تم إرسال العرض")}</span>}</div><p className="mt-4 text-lg font-semibold" dir="ltr">{formatAed(request.budget_min_aed)} – {formatAed(request.budget_max_aed)}</p>{request.referenceUrl && <a href={request.referenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-jade-700 underline">{t("View private reference image", "عرض الصورة المرجعية الخاصة")}</a>}<p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-muted">{request.description}</p><p className="mt-2 text-xs text-ink-muted">{request.needed_by ? t("Needed by: ", "الموعد المطلوب: ") + request.needed_by : t("No fixed deadline", "لا يوجد موعد محدد")}</p><VendorOfferForm requestId={request.id} existing={existing} products={products ?? []} arabic={ar} /></article>;
  })}{rows.length === 0 && <div className="card p-8 text-center text-ink-muted lg:col-span-2"><h2 className="font-serif text-2xl text-jade-950">{t("No open requests right now", "لا توجد طلبات مفتوحة حالياً")}</h2><p className="mt-2 text-sm">{t("New buyer requests will appear here when available.", "ستظهر طلبات العملاء الجديدة هنا عند توفرها.")}</p></div>}</div></main>;
}
