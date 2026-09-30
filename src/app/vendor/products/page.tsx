import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { VendorCollection } from "@/components/VendorCollection";
import { ProductImage } from "@/components/ProductImage";
import { vendorCategories, vendorDate, vendorStatus } from "@/lib/vendor-workspace";
import { formatAed } from "@/lib/pricing/calc";
import { InventoryConfirmationButton } from "@/components/InventoryConfirmationButton";
export const dynamic = "force-dynamic";
export default async function VendorProductsPage({ searchParams }: { searchParams: Promise<{ filter?: string; saved?: string }> }) {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const params = await searchParams;
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin.from("vendors").select("id, verification_status").eq("owner_user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load your store.");
  if (!vendor) redirect("/vendor/register");
  const { data: products, error: productError } = await admin.from("products").select("id, name, images, category, karat, weight_grams, making_charge, making_charge_discount_percent, making_charge_offer_ends_at, certificate_fee, vendor_rate_adjustment_per_gram, assay_fineness, vat_rate_bps, quantity, product_status, inventory_confirmed_at, data_quality_status, data_quality_issues, updated_at").eq("vendor_id", vendor.id).order("updated_at", { ascending: false });
  if (productError) throw new Error("Could not load products. Please retry.");
  return <div className="container-pro py-8 sm:py-10" dir={ar ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">{t("Your catalogue", "كتالوج متجرك")}</p><h1 className="mt-2 font-serif text-3xl sm:text-4xl">{t("My products", "منتجاتي")}</h1><p className="mt-2 text-sm text-ink-muted">{t("Find a piece, update its details, and keep your stock current.", "ابحث عن منتج، وحدّث بياناته، وحافظ على دقة المخزون.")}</p></div><Link href="/vendor/products/new" className="btn-primary">{t("+ Add product", "+ إضافة منتج")}</Link></div>
    <VendorNav arabic={ar} />
    {["draft", "pending_approval", "approved", "suspended"].includes(params.saved ?? "") && <p role="status" className="mb-5 rounded-xl border border-jade-200 bg-jade-50 p-4 text-sm text-jade-900">{t("Product saved.", "تم حفظ المنتج.")} {vendorStatus(params.saved!, ar)}</p>}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold-300/50 bg-gold-50 p-5"><div><h2 className="text-sm font-semibold">{t("A quick stock check keeps your catalogue useful", "مراجعة المخزون تساعد العملاء في العثور على المتوفر")}</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">{t("Confirm only items you have checked in store. You still confirm availability and the final price for each purchase request before the customer pays.", "أكد فقط المنتجات التي تحققت من توفرها. ستؤكد التوفر والسعر النهائي لكل طلب شراء قبل أن يدفع العميل.")}</p></div><InventoryConfirmationButton arabic={ar} /></div>
    <VendorCollection arabic={ar} initialFilter={params.filter} placeholder={t("Search by product name, category or karat…", "ابحث بالاسم أو الفئة أو العيار…")} filters={[
      { value: "all", label: t("All products", "كل المنتجات") }, { value: "approved", label: t("Approved", "معتمدة") }, { value: "draft", label: t("Drafts", "المسودات") }, { value: "pending_approval", label: t("In review", "قيد المراجعة") }, { value: "attention", label: t("Needs attention", "تحتاج إلى مراجعة") },
    ]} empty={<><p className="font-serif text-xl text-jade-950">{t("Your first piece starts here", "ابدأ بإضافة أول منتج")}</p><p className="mt-2">{t("Add photos and product details. You can save a draft before submitting it for review.", "أضف الصور والتفاصيل. يمكنك حفظ مسودة قبل إرسال المنتج للمراجعة.")}</p><Link className="btn-primary mt-5" href="/vendor/products/new">{t("Add your first product", "أضف منتجك الأول")}</Link></>} items={(products ?? []).map(p => ({
      id: p.id, group: ["rejected", "suspended"].includes(p.product_status) || p.data_quality_status === "blocked" || Number(p.quantity) === 0 ? "attention" : p.product_status,
      search: `${p.name} ${p.category} ${p.karat}K ${vendorCategories.find(c => c[0] === p.category)?.[2] ?? ""}`,
      content: <article className="card overflow-hidden"><div className="flex flex-col sm:flex-row"><div className="relative h-48 shrink-0 bg-bone-soft sm:h-auto sm:min-h-56 sm:w-48"><ProductImage name={p.name} category={p.category} karat={p.karat} images={p.images} sizes="(max-width: 640px) 90vw, 192px" /></div><div className="min-w-0 flex-1 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-ink-muted">{vendorCategories.find(c => c[0] === p.category)?.[ar ? 2 : 1]} · {p.karat}K · {p.weight_grams}g</p><h2 className="mt-1 break-words font-serif text-xl text-jade-950">{p.name}</h2></div><span className="pill border-jade-900/10 bg-bone-soft">{vendorStatus(p.product_status, ar)}</span></div>
      <dl className="my-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[[t("Making / item", "المصنعية للقطعة"), formatAed(Number(p.making_charge))], [t("Certificate", "الشهادة"), formatAed(Number(p.certificate_fee ?? 0))], [t("Stock quantity", "كمية المخزون"), p.quantity], [t("VAT", "الضريبة"), Number(p.vat_rate_bps) === 0 ? t("Not charged", "لا تُحتسب") : "5%"]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl>
      {p.data_quality_status === "blocked" && <p className="mb-3 text-xs font-semibold text-signal-err">{t("Product details need correction. Open Edit to review before submitting.", "تحتاج بيانات المنتج إلى تصحيح. افتح التعديل للمراجعة قبل الإرسال.")}</p>}
      {Number(p.quantity) === 0 && <p className="mb-3 text-xs font-semibold text-signal-warn">{t("Out of stock — update the quantity when available.", "غير متوفر — حدّث الكمية عند توفر المنتج.")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-jade-900/10 pt-3"><p className="text-xs text-ink-muted">{t("Stock checked", "آخر مراجعة للمخزون")}: {vendorDate(p.inventory_confirmed_at, ar)}</p><div className="flex flex-wrap gap-2">{p.product_status === "approved" && Number(p.quantity) > 0 && <InventoryConfirmationButton productId={p.id} arabic={ar} />}<Link href={`/vendor/products/${p.id}`} className="btn-ghost px-4 py-2 text-xs">{t("Edit product", "تعديل المنتج")}</Link></div></div></div></div></article>,
    }))} />
  </div>;
}
