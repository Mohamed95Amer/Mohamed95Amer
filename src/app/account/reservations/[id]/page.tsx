import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { getLatestTick } from "@/lib/gold-price/service";
import {
  calculateReservationValue,
  formatDubaiDate,
  formatSignedPercent,
  isActiveLockStatus,
  isPurchaseStatus,
  isReservationActive,
  type PriceSnapshotForInsight,
} from "@/lib/gold-insights";
import { GoldPriceBadge } from "@/components/GoldPriceBadge";
import { ReviewForm } from "@/components/ReviewForm";
import { FulfilmentDetails } from "@/components/FulfilmentDetails";
import Link from "next/link";
import { statusLabel } from "@/lib/presentation";
import { BankTransferProof } from "@/components/BankTransferProof";
import { ConfirmedPriceActions } from "@/components/ConfirmedPriceActions";
import { OrderConversation } from "@/components/OrderConversation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const [{ data: r }, latestTick] = await Promise.all([
    admin
      .from("reservations")
      .select(
        "*, product:products(name, karat, weight_grams), vendor:vendors(business_name, emirate, email, phone), snapshot:order_price_snapshots(*)",
      )
      .eq("id", id)
      .single(),
    getLatestTick(),
  ]);
  if (!r) return notFound();
  if (r.customer_user_id !== user.id) return notFound();

  const { data: existingReview } = await admin
    .from("reviews")
    .select(
      "overall_rating, product_rating, communication_rating, fulfilment_rating, packaging_rating, delivery_rating, title, comment, editable_until",
    )
    .eq("reservation_id", r.id)
    .maybeSingle();
  const { data: deliveryAssignment } =
    r.fulfilment_method === "delivery"
      ? await admin
          .from("delivery_assignments")
          .select(
            "status, tracking_code, public_note, accepted_at, picked_up_at, delivered_at, company:delivery_companies(company_name, phone)",
          )
          .eq("reservation_id", r.id)
          .maybeSingle()
      : { data: null };

  const product = r.product as unknown as {
    name: string;
    karat: number;
    weight_grams: number;
  } | null;
  const vendor = r.vendor as unknown as {
    business_name: string;
    emirate: string;
    email: string;
    phone: string;
  } | null;
  const snapArr = r.snapshot as unknown as Array<
    Record<string, number | string>
  > | null;
  const snap = Array.isArray(snapArr)
    ? snapArr[0]
    : (snapArr as unknown as Record<string, number | string> | null);
  const currentRate = Number(latestTick?.price_per_gram_24k_aed ?? 0);
  const snapshotQuantity = Number(snap?.quantity ?? r.quantity);
  const insight =
    snap && currentRate > 0
      ? calculateReservationValue(
          snap as unknown as PriceSnapshotForInsight,
          currentRate,
        )
      : null;
  const active = isReservationActive(r.status, r.expires_at);
  const lapsedLock = isActiveLockStatus(r.status) && !active;
  const tracked = isPurchaseStatus(r.status) || active;
  const difference = insight?.differenceAed ?? 0;
  const stage = ["completed"].includes(r.status)
    ? 5
    : ["delivered"].includes(r.status)
      ? 4
      : ["preparing_order", "ready_for_delivery", "out_for_delivery"].includes(
            r.status,
          )
        ? 3
        : ["paid", "payment_confirmed"].includes(r.status)
          ? 2
          : ["payment_pending", "payment_verification"].includes(r.status)
            ? 1
            : 0;
  const confirmedTotal = Number(
    r.vendor_confirmed_price_aed ?? snap?.total_price_aed ?? 0,
  );
  const estimateTotal = Number(snap?.total_price_aed ?? 0);

  return (
    <div className="container-pro max-w-4xl py-10 sm:py-14" dir={arabic ? "rtl" : "ltr"}>
      <Link
        href="/account"
        className="text-sm font-semibold text-jade-700 hover:text-jade-500"
      >
        {t("← Back to your history", "العودة إلى سجل طلباتك ←")}
      </Link>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-jade-600">{t("Reservation details", "تفاصيل الطلب")}</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">
            {product?.name ?? t("Gold item", "قطعة ذهب")}
          </h1>
          <p className="mt-1 text-xs text-ink-muted">{t("Reference", "رقم المرجع")} {r.id}</p>
        </div>
        <GoldPriceBadge compact arabic={arabic} />
      </div>

      <div className="card mt-7 grid gap-4 p-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="label">{t("Status", "الحالة")}</span>
          <span className="pill mt-2 border-jade-900/10 bg-jade-50">
            {lapsedLock
              ? t("Price lock expired", "انتهت مهلة تثبيت السعر")
              : statusLabel(r.status, arabic)}
          </span>
        </div>
        <div>
          <span className="label">{t("Item", "القطعة")}</span>
          <p className="mt-2 text-jade-950">
            {product?.karat}K · {product?.weight_grams}{t("g", "غ")} · {t("quantity", "الكمية")} {r.quantity}
          </p>
        </div>
        <div>
          <span className="label">{t("Timing", "التوقيت")}</span>
          <p className="mt-2 text-jade-950">
            {r.status === "pending_vendor_confirmation"
              ? r.submitted_during_working_hours
                ? t("Sent to store", "أُرسل إلى المتجر")
                : `${t("Queued until", "قيد الانتظار حتى")} ${formatDubaiDate(r.vendor_action_available_at, true)}`
              : r.status === "vendor_confirmed"
                ? `${t("Respond by", "يرجى الرد قبل")} ${formatDubaiDate(r.expires_at, true)}`
                : ["payment_pending"].includes(r.status)
                  ? `${lapsedLock ? t("Payment window ended", "انتهت مهلة الدفع") : `${t("Pay by", "ادفع قبل")} ${formatDubaiDate(r.expires_at, true)}`}`
                  : statusLabel(r.status, arabic)}
          </p>
        </div>
        <div>
          <span className="label">{t("Order identity", "التحقق من هوية الطلب")}</span>
          <p className="mt-2 font-medium text-jade-950">
            {r.identity_verification_id
              ? t("✓ Verified for this order", "✓ تم التحقق لهذا الطلب")
              : t("Legacy order", "طلب سابق")}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <FulfilmentDetails details={r} arabic={arabic} />
        {r.vendor_delivery_snapshot && (
          <p className="mt-3 text-sm text-ink-muted">
            {t("Delivery arranged and paid for by the store from the delivery fee you pay it:", "يرتب المتجر التوصيل ويدفع تكلفته من رسوم التوصيل التي تدفعها له:")}{" "}
            {r.vendor_delivery_snapshot.mode === "external_courier"
              ? r.vendor_delivery_snapshot.courier_name
              : t("the store’s own staff", "موظفو المتجر")}
            . {t("Contact the store for scheduling.", "تواصل مع المتجر لتحديد الموعد.")}
          </p>
        )}
        {["cash", "card"].includes(r.payment_method) && (
          <p className="mt-3 text-sm">
            {t("Payment:", "الدفع:")}{" "}
            {r.payment_method === "cash"
              ? t("cash", "نقداً")
              : t("card using the vendor’s terminal", "بالبطاقة عبر جهاز المتجر")}{" "}
            {t("directly to the store at", "مباشرةً للمتجر عند")}{" "}
            {r.fulfilment_method === "collection" ? t("collection", "الاستلام") : t("delivery", "التوصيل")}.
            {t("After store acceptance, arrange completion within the displayed 24-hour deadline. Contact the store before paying for an expired order.", "بعد قبول المتجر، أكمل الطلب خلال المهلة المعروضة البالغة 24 ساعة. تواصل مع المتجر قبل الدفع لطلب منتهي الصلاحية.")}
          </p>
        )}
      </div>
      <div className="mt-6">
        <OrderConversation
          reservationId={r.id}
          viewerRole="customer"
          arabic={arabic}
        />
      </div>
      {r.status === "vendor_confirmed" && active && (
        <section className="card mt-6 border-gold-400/40 bg-gold-50 p-6">
          <p className="eyebrow text-gold-700">{t("Store confirmed", "أكد المتجر التوفر")}</p>
          <h2 className="mt-1 font-serif text-2xl">{t("Review the final price", "راجع السعر النهائي")}</h2>
          <p className="mt-3 text-sm">
            {t("The store confirmed the item is available at", "أكد المتجر توفر القطعة بسعر")}{" "}
            <strong>{formatAed(confirmedTotal)}</strong>. {t("The request estimate was", "كان السعر التقديري")} {formatAed(estimateTotal)}. {t("No money has been taken and the item is not held until you accept.", "لم يُحصّل أي مبلغ، ولن تُحجز القطعة حتى تقبل السعر.")}
          </p>
          {r.vendor_response_note && (
            <p className="mt-3 rounded-xl bg-white p-3 text-sm text-ink-muted">
              {t("Store note:", "ملاحظة المتجر:")} {r.vendor_response_note}
            </p>
          )}
          <ConfirmedPriceActions reservationId={r.id} arabic={arabic} />
        </section>
      )}
      {["bank_transfer", "aani"].includes(r.payment_method) && (
        <section className="card mt-6 p-6">
          <h2 className="font-serif text-2xl">
            {r.payment_method === "aani"
              ? t("Aani transfer to the store", "تحويل آني إلى المتجر")
              : t("Bank transfer to the store", "تحويل بنكي إلى المتجر")}
          </h2>
          {r.status === "payment_pending" && active ? (
            <>
              <p className="mt-3 text-sm">
                {t("The item and vendor-confirmed price are reserved for you. Transfer exactly", "القطعة والسعر المؤكد من المتجر محجوزان لك. حوّل المبلغ المحدد")}{" "}<strong>{formatAed(confirmedTotal)}</strong>{" "}
                {t("before", "قبل")} {formatDubaiDate(r.expires_at, true)}، {t("then click ‘I have paid’.", "ثم اضغط «لقد دفعت».")}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {r.payment_method === "aani" ? (
                  <div>
                    {t("Aani registered mobile:", "رقم الهاتف المسجل في آني:")}{" "}
                    <strong>{r.bank_details_snapshot?.aani_mobile}</strong>
                  </div>
                ) : (
                  <>
                    <div>{t("Bank:", "البنك:")} {r.bank_details_snapshot?.bank_name}</div>
                    <div>
                      {t("Beneficiary:", "المستفيد:")} {r.bank_details_snapshot?.beneficiary_name}
                    </div>
                    <div className="break-all">
                      IBAN: {r.bank_details_snapshot?.iban}
                    </div>
                  </>
                )}
                <div className="break-all">
                  {t("Amount:", "المبلغ:")} <strong>{formatAed(confirmedTotal)}</strong>
                </div>
                <div className="break-all">
                  {t("Get Gold order reference:", "مرجع طلب Get Gold:")} {r.id}
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-muted">
                {t("These bank details were supplied by the vendor. Get Gold does not receive your money. Fulfilment starts only after the vendor checks its bank and confirms receipt.", "قدم المتجر بيانات التحويل هذه. لا يستلم Get Gold أموالك. يبدأ تجهيز الطلب بعد أن يتحقق المتجر من حسابه البنكي ويؤكد الاستلام.")}
              </p>
              <BankTransferProof
                arabic={arabic}
                reservationId={r.id}
                submitted={Boolean(r.transfer_proof_path)}
              />
            </>
          ) : (
            <p className="mt-3 text-sm">
              {["pending_vendor_confirmation", "vendor_confirmed"].includes(
                r.status,
              )
                ? t("Do not transfer yet. Payment details unlock only after you accept the vendor-confirmed price.", "لا تحوّل الآن. تظهر بيانات الدفع بعد قبولك السعر الذي أكده المتجر.")
                : r.status === "payment_verification"
                  ? t("You marked the transfer as sent. The store is checking its own account; your screenshot or reference did not automatically confirm payment.", "أبلغت بإرسال التحويل. يتحقق المتجر من حسابه؛ الصورة أو المرجع لا يؤكدان الدفع تلقائياً.")
                  : [
                        "payment_confirmed",
                        "preparing_order",
                        "ready_for_delivery",
                        "out_for_delivery",
                        "delivered",
                        "completed",
                        "paid",
                      ].includes(r.status)
                    ? t("The store confirmed receipt of your payment.", "أكد المتجر استلام دفعتك.")
                    : t("Do not send money for this inactive order. If you already transferred, contact the store to arrange reconciliation or a refund. Do not pay twice.", "لا ترسل المال لهذا الطلب غير النشط. إن كنت قد حوّلت، فتواصل مع المتجر للمراجعة أو استرداد المبلغ. لا تدفع مرتين.")}
            </p>
          )}
        </section>
      )}

      {deliveryAssignment &&
        (() => {
          const company = Array.isArray(deliveryAssignment.company)
            ? deliveryAssignment.company[0]
            : deliveryAssignment.company;
          return (
            <section className="card mt-6 border-gold-300/30 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-jade-600">{t("Delivery tracking", "تتبع التوصيل")}</p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">
                    {company?.company_name ?? t("Assigned delivery partner", "شركة التوصيل المكلفة")}
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {t("Tracking", "رقم التتبع")} {deliveryAssignment.tracking_code}
                    {company?.phone ? ` · ${company.phone}` : ""}
                  </p>
                </div>
                <span className="pill border-jade-900/10 bg-jade-50">
                  {statusLabel(deliveryAssignment.status, arabic)}
                </span>
              </div>
              {deliveryAssignment.public_note && (
                <p className="mt-4 rounded-xl bg-jade-50 p-3 text-sm text-ink-muted">
                  {deliveryAssignment.public_note}
                </p>
              )}
              <ol className="mt-5 grid grid-cols-4 gap-2 text-center text-[10px] text-ink-muted">
                {[
                  ["accepted", t("Accepted", "مقبول")],
                  ["collected", t("Collected", "تم الاستلام")],
                  ["out_for_delivery", t("On the way", "في الطريق")],
                  ["delivered", t("Delivered", "تم التوصيل")],
                ].map(([key, label], index, all) => {
                  const current = all.findIndex(
                    ([state]) => state === deliveryAssignment.status,
                  );
                  const complete =
                    deliveryAssignment.status === "delivered" ||
                    (current >= 0 && index <= current);
                  return (
                    <li key={key}>
                      <span
                        className={`mx-auto mb-2 block h-2.5 w-2.5 rounded-full ${complete ? "bg-jade-700" : "bg-bone-deep"}`}
                      />
                      {label}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })()}

      <div className="card mt-6 p-5 text-sm">
        <span className="label">{t("Payment choice", "طريقة الدفع")}</span>
        <p className="mt-2 font-medium text-jade-950">
          {r.payment_method === "pay_online"
            ? t("Online checkout requested", "طُلب الدفع الإلكتروني")
            : t("Pay the seller directly", "الدفع مباشرة للبائع")}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {r.payment_method === "pay_online"
            ? `${t("Payment status:", "حالة الدفع:")} ${statusLabel(r.payment_status, arabic)}`
            : t("Get Gold does not hold the payment for this order.", "لا يحتفظ Get Gold بمبلغ هذا الطلب.")}
        </p>
      </div>

      <section className="card mt-6 p-6 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-jade-600">{t("Order journey", "مراحل الطلب")}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">
              {t("What happens next", "ما الخطوة التالية؟")}
            </h2>
          </div>
          {vendor && (
            <p className="text-sm text-ink-muted">
              {t("Seller:", "البائع:")}{" "}
              <span className="font-semibold text-jade-950">
                {vendor.business_name}
              </span>{" "}
              · {vendor.emirate}
            </p>
          )}
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            t("Store confirmation", "تأكيد المتجر"),
            t("Customer payment", "دفع العميل"),
            t("Payment confirmed", "تأكيد الدفع"),
            t("Preparing", "التجهيز"),
            t("Delivered", "التوصيل"),
            t("Completed", "الاكتمال"),
          ].map((label, index) => (
            <li
              key={label}
              className={`rounded-xl border p-4 text-sm ${index <= stage ? "border-jade-300 bg-jade-50 text-jade-950" : "border-jade-900/10 bg-white text-ink-muted"}`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${index < stage ? "bg-jade-700 text-white" : index === stage ? "bg-gold-300 text-jade-950" : "bg-bone text-ink-muted"}`}
              >
                {index < stage ? "✓" : index + 1}
              </span>
              <span className="mt-3 block font-semibold">{label}</span>
            </li>
          ))}
        </ol>
        {vendor && (
          <p className="mt-5 text-sm text-ink-muted">
            {t("Store contact:", "التواصل مع المتجر:")}{" "}
            <a
              href={`mailto:${vendor.email}`}
              className="font-semibold text-jade-700 underline underline-offset-4"
            >
              {vendor.email}
            </a>
            {vendor.phone ? ` · ${vendor.phone}` : ""}
          </p>
        )}
      </section>

      {stage >= 0 && stage < 3 && (
        <div className="mt-6 rounded-2xl border border-gold-400/25 bg-gold-50 p-5 text-sm leading-relaxed text-ink-muted">
          <strong className="text-jade-950">{t("Before paying:", "قبل الدفع:")}</strong> {t("match the vendor name, item, quantity and locked total shown here. Get Gold will never ask for your OTP, banking password or card details by email.", "طابق اسم المتجر والقطعة والكمية والمبلغ المثبت المعروض هنا. لن يطلب منك Get Gold رمز التحقق أو كلمة مرور البنك أو بيانات البطاقة عبر البريد الإلكتروني.")}
        </div>
      )}

      {insight && tracked && (
        <div className="mt-6 overflow-hidden rounded-2xl bg-jade-950 p-6 text-white shadow-lift sm:p-8">
          <p className="eyebrow text-gold-200">{t("Market-linked update", "تحديث وفق السوق")}</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-white/50">{t("Locked total", "الإجمالي المثبت")}</p>
              <p className="mt-1 font-serif text-2xl tabular-nums">
                {formatAed(Number(snap?.total_price_aed))}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50">{t("Comparable value now", "القيمة المقارنة الآن")}</p>
              <p className="mt-1 font-serif text-2xl tabular-nums text-gold-200">
                {formatAed(insight.currentComparableTotalAed)}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/50">
                {difference >= 0 ? t("Advantage vs today", "الفرق لصالحك اليوم") : t("Change vs today", "التغير مقارنة باليوم")}
              </p>
              <p className="mt-1 font-serif text-2xl tabular-nums">
                {difference > 0 ? "+" : ""}
                {formatAed(difference)}
              </p>
            </div>
          </div>
          <p className="mt-5 border-t border-white/10 pt-4 text-sm text-white/60">
            {t("The 24K reference moved", "تغير السعر المرجعي لعيار 24 بمقدار")}{" "}
            {formatSignedPercent(insight.goldRateChangePercent)} {t("from your captured rate of", "من السعر المسجل لطلبك")}{" "}
            {formatAed(Number(snap?.gold_price_per_gram_24k_aed))}/{t("g", "غ")} {t("to", "إلى")}{" "}
            {formatAed(currentRate)}/{t("g", "غ")}.
          </p>
        </div>
      )}

      {snap && (
        <div className="card mt-6 p-6">
          <h2 className="font-serif text-xl">{t("Price breakdown", "تفصيل السعر")}</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {t("All amounts below cover", "جميع المبالغ أدناه تشمل")} {snapshotQuantity}{" "}
            {snapshotQuantity === 1 ? t("item", "قطعة") : t("items", "قطع")}. {t("The store must separately confirm the final payable total.", "يجب أن يؤكد المتجر المبلغ النهائي المستحق بشكل مستقل.")}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-muted">{t("Gold value", "قيمة الذهب")}</dt>
            <dd className="text-right">
              {formatAed(Number(snap.gold_value_aed) * snapshotQuantity)}
            </dd>
            <dt className="text-ink-muted">{t("Making", "المصنعية")}</dt>
            <dd className="text-right">
              {Number(snap.making_charge_discount_percent ?? 0) > 0 && (
                <span className="mr-2 text-ink-muted line-through">
                  {formatAed(
                    Number(snap.original_making_charge ?? snap.making_charge) *
                      snapshotQuantity,
                  )}
                </span>
              )}
              {formatAed(Number(snap.making_charge) * snapshotQuantity)}
            </dd>
            {Number(snap.certificate_fee ?? 0) > 0 && (
              <>
                <dt className="text-ink-muted">{t("Certificate / assay", "الشهادة / الفحص")}</dt>
                <dd className="text-right">
                  {formatAed(Number(snap.certificate_fee) * snapshotQuantity)}
                </dd>
              </>
            )}
            <dt className="text-ink-muted">{t("Stone", "الأحجار")}</dt>
            <dd className="text-right">
              {formatAed(Number(snap.stone_value) * snapshotQuantity)}
            </dd>
            {Number(snap.vendor_rate_adjustment_aed ?? 0) > 0 && (
              <>
                <dt className="text-ink-muted">
                  {t("Vendor margin", "هامش التاجر")} (
                  {formatAed(Number(snap.vendor_rate_adjustment_per_gram ?? 0))}
                  /g)
                </dt>
                <dd className="text-right">
                  {formatAed(
                    Number(snap.vendor_rate_adjustment_aed) * snapshotQuantity,
                  )}
                </dd>
              </>
            )}
            {snap.assay_fineness != null && (
              <>
                <dt className="text-ink-muted">{t("Certified fineness", "النقاء المعتمد")}</dt>
                <dd className="text-right">{snap.assay_fineness}‰</dd>
              </>
            )}
            {Number(snap.vendor_premium) > 0 && (
              <>
                <dt className="text-ink-muted">
                  {t("Vendor premium (historical order)", "رسوم المتجر الإضافية (طلب سابق)")}
                </dt>
                <dd className="text-right">
                  {formatAed(Number(snap.vendor_premium) * snapshotQuantity)}
                </dd>
              </>
            )}
            <dt className="text-ink-muted">
              {t("Get Gold fee", "رسوم Get Gold")}{" "}
              {Number(snap.customer_fee_discount_percent ?? 0) > 0
                ? t("(50% off)", "(خصم 50%)")
                : ""}
            </dt>
            <dd className="text-right">
              {formatAed(Number(snap.platform_fee) * snapshotQuantity)}
            </dd>
            {Number(snap.service_fee_event_discount_percent ?? 0) > 0 && (
              <>
                <dt className="text-signal-ok">
                  {String(snap.marketplace_promotion_title ?? t("Seasonal offer", "عرض موسمي"))}
                </dt>
                <dd className="text-right font-medium text-signal-ok">
                  {t("Extra discount on fee:", "خصم إضافي على الرسوم:")} {snap.service_fee_event_discount_percent}%
                </dd>
              </>
            )}
            {(Number(snap.customer_fee_discount_percent ?? 0) > 0 ||
              Number(snap.service_fee_event_discount_percent ?? 0) > 0) && (
              <>
                <dt className="text-ink-muted">{t("Standard 1% fee", "الرسوم المعتادة 1%")}</dt>
                <dd className="text-right text-ink-muted line-through">
                  {formatAed(
                    ((Number(snap.gold_value_aed) +
                      Number(snap.making_charge) +
                      Number(snap.certificate_fee ?? 0) +
                      Number(snap.stone_value) +
                      Number(snap.vendor_premium) +
                      Number(snap.vendor_rate_adjustment_aed ?? 0)) *
                      snapshotQuantity) /
                      100,
                  )}
                </dd>
              </>
            )}
            <dt className="text-ink-muted">
              {t("Delivery", "التوصيل")}{" "}
              {snap.delivery_fee_basis === "per_order"
                ? t("(once per order)", "(مرة واحدة لكل طلب)")
                : t("(original per-item rate)", "(التعرفة الأصلية لكل قطعة)")}
            </dt>
            <dd className="text-right">
              {formatAed(
                Number(snap.delivery_fee) *
                  (snap.delivery_fee_basis === "per_order"
                    ? 1
                    : snapshotQuantity),
              )}
            </dd>
            {Number(snap.delivery_event_discount_percent ?? 0) > 0 && (
              <>
                <dt className="text-signal-ok">{t("Delivery offer", "عرض التوصيل")}</dt>
                <dd className="text-right font-medium text-signal-ok">
                  {t("Discount", "خصم")} {snap.delivery_event_discount_percent}% · {t("was", "كان")}{" "}
                  {formatAed(
                    Number(snap.delivery_fee_before_event_discount ?? 0),
                  )}
                </dd>
              </>
            )}
            <dt className="text-ink-muted">
              {t("VAT", "ضريبة القيمة المضافة")} ({Number(snap.vat_rate_bps ?? 0) / 100}%)
            </dt>
            <dd className="text-right">
              {Number(snap.vat_rate_bps ?? 0) === 0 &&
              Number(snap.vat_aed ?? 0) === 0
                ? t("Not charged", "غير مُحصّلة")
                : formatAed(Number(snap.vat_aed))}
            </dd>
            {r.vendor_confirmed_price_aed != null &&
              confirmedTotal !== estimateTotal && (
                <>
                  <dt className="text-gold-700">{t("Vendor-confirmed adjustment", "تعديل السعر الذي أكده المتجر")}</dt>
                  <dd className="text-right text-gold-700">
                    {confirmedTotal - estimateTotal > 0 ? "+" : ""}
                    {formatAed(confirmedTotal - estimateTotal)}
                  </dd>
                </>
              )}
            <dt className="font-medium">
              {r.vendor_confirmed_price_aed != null
                ? t("Vendor-confirmed total", "الإجمالي المؤكد من المتجر")
                : t("Request estimate", "السعر التقديري للطلب")}
            </dt>
            <dd className="text-right font-medium">
              {formatAed(
                r.vendor_confirmed_price_aed != null
                  ? confirmedTotal
                  : estimateTotal,
              )}
            </dd>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            {t("Locked gold price:", "سعر الذهب المثبت:")}{" "}
            {formatAed(Number(snap.gold_price_per_gram_24k_aed))}/{t("g", "غ")} 24K · {t("quote fetched", "تم جلب السعر")}{" "}
            {formatDubaiDate(snap.gold_price_fetched_at as string, true)}
          </p>
        </div>
      )}
      {["paid", "completed"].includes(r.status) && (
        <section id="review" className="card mt-6 p-6 sm:p-8">
          <p className="eyebrow text-jade-600">{t("Verified purchase", "عملية شراء موثقة")}</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-jade-950">
            {existingReview ? t("Your review", "تقييمك") : t("Rate your store experience", "قيّم تجربتك مع المتجر")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {t("Your store rating covers the product and seller. Delivery is scored separately so a courier issue does not unfairly reduce the jeweller's rating.", "يشمل تقييم المتجر القطعة والبائع. ويُقيّم التوصيل منفصلاً حتى لا تؤثر مشكلة شركة التوصيل ظلماً في تقييم الصائغ.")}
          </p>
          <div className="mt-6">
            <ReviewForm reservationId={r.id} existing={existingReview} arabic={arabic} />
          </div>
        </section>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-muted">
        {t("The current comparison updates only the gold component and holds the captured making, certificate or assay, vendor margin, stone and fee amounts constant. It is not an appraisal, resale offer or financial advice.", "تحدّث المقارنة الحالية قيمة الذهب فقط، مع إبقاء المصنعية والشهادة أو الفحص وهامش التاجر والأحجار والرسوم المسجلة ثابتة. وليست تقييماً للقطعة أو عرض إعادة بيع أو نصيحة مالية.")}
      </p>
    </div>
  );
}
