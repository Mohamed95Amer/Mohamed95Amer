import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { AdminVendorActions } from "./AdminVendorActions";
import { AdminDocViewerClient } from "@/components/AdminDocViewerClient";
import { AdminVendorPromotionControl } from "./AdminVendorPromotionControl";
import { cookies } from "next/headers";
import { AdminPaymentDestinationReview } from "./AdminPaymentDestinationReview";

export const dynamic = "force-dynamic";

export default async function AdminVendorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("*").eq("id", id).single();
  if (!vendor) return notFound();

  const { data: docs } = await admin
    .from("vendor_documents")
    .select("id, doc_type, original_filename, storage_path, mime_type, size_bytes, uploaded_at")
    .eq("vendor_id", vendor.id)
    .order("uploaded_at", { ascending: false });
  const { data: promotions } = await admin.from("vendor_promotions")
    .select("id, label, reward_reason, starts_at, ends_at, cancelled_at, admin_note")
    .eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(25);
  const { data: paymentSettings } = await admin.from("vendor_payment_settings")
    .select("aani_enabled, aani_mobile, bank_transfer_enabled, bank_name, beneficiary_name, iban, destination_verification_status, destination_submitted_at, destination_verified_at, destination_review_note")
    .eq("vendor_id", vendor.id).maybeSingle();

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">{vendor.business_name}</h2>
            <p className="text-sm text-ink-muted">{vendor.emirate} · {vendor.store_address}</p>
          </div>
          <span className="pill border-bone-deep bg-bone-soft">{vendor.verification_status}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-muted">{arabic ? "جهة الاتصال" : "Contact"}</dt><dd>{[vendor.contact_first_name, vendor.contact_last_name].filter(Boolean).join(" ") || vendor.owner_name}{vendor.contact_title ? ` · ${vendor.contact_title}` : ""}</dd>
          <dt className="text-ink-muted">{arabic ? "البريد" : "Email"}</dt><dd>{vendor.email}</dd>
          <dt className="text-ink-muted">{arabic ? "الهاتف" : "Phone"}</dt><dd>{vendor.phone}</dd>
          <dt className="text-ink-muted">{arabic ? "رقم الرخصة" : "License #"}</dt><dd>{vendor.trade_license_number}</dd>
          <dt className="text-ink-muted">{arabic ? "انتهاء الرخصة" : "License expiry"}</dt><dd>{vendor.license_expiry_date}</dd>
          <dt className="text-ink-muted">{arabic ? "عدد المتاجر" : "Stores"}</dt><dd>{vendor.number_of_stores ?? 1}</dd>
          <dt className="text-ink-muted">{arabic ? "التوصيل" : "Delivery"}</dt><dd>{vendor.delivery_available ? (arabic ? "متاح" : "Available") : (arabic ? "غير متاح حالياً" : "Not currently offered")}</dd>
          <dt className="text-ink-muted">{arabic ? "الدفع الإلكتروني" : "Online payment"}</dt><dd>{vendor.online_payment_available ? (arabic ? "متاح" : "Available") : (arabic ? "غير متاح حالياً" : "Not currently offered")}</dd>
          <dt className="text-ink-muted">{arabic ? "الموقع الإلكتروني" : "Website"}</dt><dd>{vendor.website_available ? (vendor.website_url ?? (arabic ? "لم يُضف الرابط" : "Link not supplied")) : (arabic ? "غير مسجل" : "Not listed")}</dd>
          <dt className="text-ink-muted">{arabic ? "الرقم الضريبي" : "VAT TRN"}</dt><dd>{vendor.vat_trn_number ?? "—"}</dd>
        </dl>
        <div className="mt-5 rounded-2xl border border-jade-900/10 bg-jade-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-jade-950">{arabic ? "جاهزية المتجر" : "Onboarding readiness"}</p><span className="pill border-jade-900/10 bg-white">{[vendor.contact_first_name, vendor.phone, vendor.trade_license_number, vendor.store_latitude != null && vendor.store_longitude != null].filter(Boolean).length}/4 {arabic ? "مكتملة" : "complete"}</span></div>
          <p className="mt-1 text-xs text-ink-muted">{arabic ? "الدبوس المحفوظ يساعد في دقة التوصيل وزيارات المتجر." : "A saved pin is recommended for delivery accuracy and store visits."}</p>
          {vendor.store_latitude != null && vendor.store_longitude != null ? <a className="mt-3 inline-block text-sm font-semibold text-jade-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${vendor.store_latitude},${vendor.store_longitude}`} target="_blank" rel="noreferrer">{arabic ? "فتح دبوس المتجر المحفوظ ←" : "Open saved store pin →"}</a> : <p className="mt-3 text-sm font-semibold text-gold-700">{arabic ? "الدبوس مطلوب" : "Pin still needed"}</p>}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-xl">{arabic ? "المستندات" : "Documents"}</h3>
        <ul className="mt-4 divide-y divide-bone-deep">
          {(docs ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{d.original_filename ?? d.storage_path}</div>
                <div className="text-xs text-ink-muted">{d.doc_type} · {d.mime_type} · {d.size_bytes ? Math.round(d.size_bytes/1024) : 0} KB</div>
              </div>
              <AdminDocViewerClient path={d.storage_path} />
            </li>
          ))}
          {(docs ?? []).length === 0 && <li className="py-3 text-ink-muted">{arabic ? "لم تُرفع مستندات." : "No documents uploaded."}</li>}
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-xl">{arabic ? "اعتماد وجهة الدفع" : "Payment destination approval"}</h3>
        <p className="mt-1 text-sm text-ink-muted">{arabic ? "اعتمد رقم آني أو الحساب البنكي بشكل منفصل عن اعتماد المتجر. أي تغيير يعيد المراجعة تلقائياً." : "Approve Aani or bank details separately from the store. Any destination change automatically pauses transfers and requests a new review."}</p>
        <AdminPaymentDestinationReview vendorId={vendor.id} settings={paymentSettings} arabic={arabic} />
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-xl">{arabic ? "القرار" : "Decision"}</h3>
        <p className="text-sm text-ink-muted mt-1">{arabic ? "اعتمد المتجر أو ارفضه أو أوقفه. الاعتماد مطلوب قبل نشر المنتجات." : "Approve, reject or suspend this vendor. Approval is required before they can publish products."}</p>
        <div className="mt-4">
          <AdminVendorActions vendorId={vendor.id} currentStatus={vendor.verification_status} />
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-serif text-xl">{arabic ? "ظهور المتجر المميز" : "Premium vendor placement"}</h3>
        <p className="mt-1 text-sm text-ink-muted">{arabic ? "امنح المتجر ظهوراً محدد المدة أعلى المتاجر العادية. يظهر للعميل دائماً وسم إعلان صغير." : "Reward this store with a time-limited position above organic vendors. Customers always see a small “Ad” disclosure."}</p>
        <div className="mt-5"><AdminVendorPromotionControl vendorId={vendor.id} promotions={promotions ?? []} /></div>
      </div>
    </div>
  );
}
