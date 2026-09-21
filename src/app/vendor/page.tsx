import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getCurrentProfile } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function VendorDashboardPage() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!vendor) redirect("/vendor/register");
  const t = arabic ? {
    overview: "نظرة عامة على المتجر", products: "المنتجات", orders: "الطلبات المعلقة", documents: "المستندات", reputation: "السمعة", manage: "إدارة منتجاتك ←", confirm: "تأكيد أو رفض ←", upload: "الرخصة والهوية والصور ←", reviews: "قراءة التقييمات والرد ←", activity: "نشاط السوق", last30: "آخر 30 يوماً", fresh: "منتجات نشطة حديثة", approved: "معتمدة", reservations: "الحجوزات", outcomes: "كل نتائج الطلبات", offers: "عروض طلبات العملاء", sent: "العروض التي أرسلها متجرك", visits: "طلبات زيارة المتجر", received: "الطلبات المستلمة", setup: "خطوات تفعيل متجرك", setupBody: "أكمل هذه الخطوات ليظهر متجرك بثقة ويحصل العملاء على معلومات دقيقة.", profile: "بيانات المتجر", location: "أضف دبوس موقع المتجر", listing: "أضف أول منتج", payment: "حدد خيارات الدفع والتوصيل", open: "فتح ←", pending: "حسابك قيد المراجعة. يمكنك تجهيز المسودات، لكن لا يمكن نشر المنتجات قبل موافقة الإدارة.", approvedStatus: "حسابك معتمد. يمكنك الآن إدارة المنتجات واستقبال الطلبات.",
  } : { overview: "Store overview", products: "Products", orders: "Pending orders", documents: "Documents", reputation: "Reputation", manage: "Manage your listings →", confirm: "Confirm or reject →", upload: "Trade license, IDs, photos →", reviews: "Read and respond →", activity: "Marketplace activity", last30: "Last 30 days", fresh: "Fresh live listings", approved: "approved", reservations: "Reservations", outcomes: "All order outcomes", offers: "Buyer-request offers", sent: "Offers your store sent", visits: "Store-visit leads", received: "Requests received", setup: "Store launch checklist", setupBody: "Complete these steps so your store looks trustworthy and customers have accurate information.", profile: "Complete store profile", location: "Add your store pin", listing: "Add your first product", payment: "Set payment & delivery options", open: "Open →", pending: `Your account is ${statusLabel(vendor.verification_status).toLowerCase()}. You can prepare drafts, but you cannot publish products until admin approval.`, approvedStatus: "Your account is approved. You can now manage products and receive orders.", };

  const [{ count: productCount }, { count: pendingOrders }, { data: liquidity }] = await Promise.all([
    admin.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendor.id),
    admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendor.id)
      .eq("status", "pending_vendor_confirmation"),
    admin.from("vendor_liquidity_summary").select("live_listings, approved_listings, reservations_30d, request_offers_30d, visit_requests_30d").eq("vendor_id", vendor.id).maybeSingle(),
  ]);

  return (
    <div className="container-pro py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{vendor.business_name}</h1>
          <p className="text-sm text-ink-muted">{vendor.emirate} · {profile?.email}</p>
        </div>
        <span
          className={`pill ${
            vendor.verification_status === "approved"
              ? "border-signal-ok/30 bg-signal-ok/10 text-signal-ok"
              : vendor.verification_status === "rejected" || vendor.verification_status === "suspended"
              ? "border-signal-err/30 bg-signal-err/10 text-signal-err"
              : "border-signal-warn/30 bg-signal-warn/10 text-signal-warn"
          }`}
        >
          {statusLabel(vendor.verification_status)}
        </span>
      </div>
      <VendorNav />

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/vendor/products" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">{t.products}</div>
          <div className="mt-2 font-serif text-3xl">{productCount ?? 0}</div>
          <div className="mt-2 text-sm text-ink-muted">{t.manage}</div>
        </Link>
        <Link href="/vendor/orders" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">{t.orders}</div>
          <div className="mt-2 font-serif text-3xl">{pendingOrders ?? 0}</div>
          <div className="mt-2 text-sm text-ink-muted">{t.confirm}</div>
        </Link>
        <Link href="/vendor/documents" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">{t.documents}</div>
          <div className="mt-2 font-serif text-3xl">Upload</div>
          <div className="mt-2 text-sm text-ink-muted">{t.upload}</div>
        </Link>
        <Link href="/vendor/reviews" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">{t.reputation}</div>
          <div className="mt-2 font-serif text-3xl">Reviews</div>
          <div className="mt-2 text-sm text-ink-muted">{t.reviews}</div>
        </Link>
      </div>

      <section className="mt-8"><p className="eyebrow text-jade-600">{t.last30}</p><h2 className="mt-1 font-serif text-2xl text-jade-950">{t.activity}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Activity label={t.fresh} value={Number(liquidity?.live_listings ?? 0)} detail={`${Number(liquidity?.approved_listings ?? 0)} ${t.approved}`} /><Activity label={t.reservations} value={Number(liquidity?.reservations_30d ?? 0)} detail={t.outcomes} /><Activity label={t.offers} value={Number(liquidity?.request_offers_30d ?? 0)} detail={t.sent} /><Activity label={t.visits} value={Number(liquidity?.visit_requests_30d ?? 0)} detail={t.received} /></div></section>

      <section className="card mt-8 border-gold-300/50 bg-gold-50/50 p-6">
        <p className="eyebrow text-gold-700">{t.setup}</p><h2 className="mt-1 font-serif text-2xl text-jade-950">{t.setupBody}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Boolean(vendor.business_name && vendor.trade_license_number && vendor.phone), t.profile, "/vendor/register"],
            [Boolean(vendor.store_latitude != null && vendor.store_longitude != null), t.location, "/vendor/register"],
            [Number(productCount ?? 0) > 0, t.listing, "/vendor/products/new"],
            [Boolean(vendor.delivery_available || vendor.online_payment_available), t.payment, "/vendor/payments"],
          ].map(([done, label, href]) => <Link key={String(label)} href={String(href)} className="rounded-2xl border border-jade-900/10 bg-white p-4 transition hover:border-jade-700"><span className={`text-xs font-bold ${done ? "text-signal-ok" : "text-gold-700"}`}>{done ? "✓ Done" : "Next step"}</span><p className="mt-2 text-sm font-semibold text-jade-950">{label}</p><p className="mt-2 text-xs font-semibold text-jade-700">{t.open}</p></Link>)}
        </div>
      </section>

      {vendor.verification_status !== "approved" && (
        <div className="card mt-8 p-6 bg-signal-warn/10 border-signal-warn/30">
          <p className="font-medium text-signal-warn">
            {vendor.verification_status === "approved" ? t.approvedStatus : t.pending}
          </p>
        </div>
      )}
    </div>
  );
}

function Activity({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="card p-5"><p className="label">{label}</p><p className="mt-2 font-serif text-3xl text-jade-950">{value}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}
