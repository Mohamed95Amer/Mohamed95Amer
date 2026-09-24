import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { VendorOrderActions } from "./VendorOrderActions";
import { VendorNav } from "@/components/VendorNav";
import { VendorCollection } from "@/components/VendorCollection";
import { FulfilmentDetails } from "@/components/FulfilmentDetails";
import { StoreVisitActions } from "@/components/StoreVisitActions";
import { DeliveryAssignmentControl } from "@/components/DeliveryAssignmentControl";
import { dubaiTodayIso } from "@/lib/time";
import { VendorOrderProgress } from "@/components/VendorOrderProgress";
import {
  vendorOrderGroup,
  vendorOrderStatus,
  vendorStatus,
  vendorDate,
} from "@/lib/vendor-workspace";
export const dynamic = "force-dynamic";
export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load your store.");
  if (!vendor) redirect("/vendor/register");
  const [
    { data: orders, error: orderError },
    { data: visits, error: visitError },
  ] = await Promise.all([
    admin
      .from("reservations")
      .select(
        "id, status, quantity, expires_at, created_at, vendor_action_available_at, submitted_during_working_hours, vendor_confirmed_price_aed, vendor_price_confirmed_at, payment_window_expires_at, payment_confirmed_at, transfer_proof_path, transfer_reference, transfer_submitted_at, identity_verification_id, fulfilment_method, payment_method, payment_status, recipient_name, recipient_phone, delivery_emirate, delivery_area, delivery_address_line_1, delivery_address_line_2, delivery_landmark, delivery_latitude, delivery_longitude, delivery_map_link, customer_note, customer:profiles!reservations_customer_user_id_fkey(full_name), product:products(name, karat, weight_grams), snapshot:order_price_snapshots(total_price_aed, platform_fee, platform_fee_bps, customer_fee_discount_percent, service_fee_event_discount_percent, delivery_fee, delivery_fee_before_event_discount, delivery_event_discount_percent, marketplace_promotion_title, vendor_rate_adjustment_aed, vat_rate_bps, vat_aed, quantity)",
      )
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false }),
    admin
      .from("store_visit_requests")
      .select(
        "id, status, preferred_at, phone, note, customer:profiles(full_name), product:products(name, karat, weight_grams)",
      )
      .eq("vendor_id", vendor.id)
      .order("preferred_at", { ascending: true }),
  ]);
  if (orderError || visitError)
    throw new Error("Could not load orders. Please retry.");
  const orderIds = (orders ?? []).map((o) => o.id);
  const [
    { data: assignments, error: assignmentError },
    { data: companies, error: companyError },
  ] = await Promise.all([
    orderIds.length
      ? admin
          .from("delivery_assignments")
          .select(
            "id, reservation_id, delivery_company_id, status, tracking_code, company:delivery_companies(company_name)",
          )
          .in("reservation_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("delivery_companies")
      .select("id, company_name, emirates_served")
      .eq("verification_status", "approved")
      .gte("license_expiry_date", dubaiTodayIso())
      .order("company_name"),
  ]);
  if (assignmentError || companyError)
    throw new Error("Could not load delivery details.");
  const assignmentByReservation = new Map(
    (assignments ?? []).map((a) => [
      a.reservation_id,
      { ...a, company: Array.isArray(a.company) ? a.company[0] : a.company },
    ]),
  );
  const now = Date.now();
  const params = await searchParams;
  const one = <T,>(value: T | T[] | null) =>
    Array.isArray(value) ? value[0] : value;
  const groupLabels: Record<string, string> = {
    requests: t("Confirm requests", "تأكيد الطلبات"),
    payments: t("Check payments", "مراجعة المدفوعات"),
    fulfilment: t("Prepare & fulfil", "التجهيز والتسليم"),
    waiting: t("Waiting", "بانتظار إجراء"),
    history: t("History", "السجل"),
  };
  return (
    <div className="container-pro py-8 sm:py-10" dir={ar ? "rtl" : "ltr"}>
      <p className="eyebrow text-jade-600">
        {t("From request to handover", "من الطلب إلى التسليم")}
      </p>
      <h1 className="mt-2 font-serif text-3xl sm:text-4xl">
        {t("Your orders", "طلبات متجرك")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        {t(
          "Confirm the item and price first. Check received payments, then prepare each order.",
          "أكد توفر المنتج وسعره أولاً. تحقق من استلام المبلغ، ثم جهّز الطلب.",
        )}
      </p>
      <VendorNav arabic={ar} />
      <VendorCollection
        arabic={ar}
        initialFilter={params.filter ?? "all"}
        placeholder={t(
          "Search customer, product or order reference…",
          "ابحث بالعميل أو المنتج أو مرجع الطلب…",
        )}
        filters={[
          { value: "all", label: t("All orders", "كل الطلبات") },
          ...Object.entries(groupLabels).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
        empty={
          <>
            <p className="font-serif text-xl text-jade-950">
              {t("Ready for your first request", "جاهز لاستقبال أول طلب")}
            </p>
            <p className="mt-2">
              {t(
                "Customer purchase requests will appear here. Confirm availability and the final price before asking for payment.",
                "ستظهر طلبات الشراء هنا. أكد التوفر والسعر النهائي قبل طلب الدفع.",
              )}
            </p>
          </>
        }
        items={(orders ?? []).map((o) => {
          const product = one(o.product);
          const customer = one(o.customer);
          const snap = one(o.snapshot);
          const estimate = Number(snap?.total_price_aed ?? 0);
          const total =
            o.vendor_confirmed_price_aed == null
              ? estimate
              : Number(o.vendor_confirmed_price_aed);
          const fee =
            Number(snap?.platform_fee ?? 0) *
            Number(snap?.quantity ?? o.quantity);
          const subsidy = Math.max(
            0,
            Number(
              snap?.delivery_fee_before_event_discount ??
                snap?.delivery_fee ??
                0,
            ) - Number(snap?.delivery_fee ?? 0),
          );
          const status = vendorOrderStatus(o, now);
          const group = vendorOrderGroup(o, now);
          const method =
            o.payment_method === "aani"
              ? t("Aani transfer", "تحويل آني")
              : o.payment_method === "bank_transfer"
                ? t("Bank transfer", "تحويل بنكي")
                : o.payment_method === "cash"
                  ? t("Cash", "نقداً")
                  : o.payment_method === "card"
                    ? t("Store card terminal", "جهاز بطاقات المتجر")
                    : t("Direct to store", "مباشرة للمتجر");
          return {
            id: o.id,
            group,
            search: `${o.id} ${product?.name ?? ""} ${customer?.full_name ?? ""} ${o.transfer_reference ?? ""}`,
            content: (
              <article className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-jade-900/10 bg-bone-soft px-5 py-3">
                  <p className="text-xs text-ink-muted">
                    <span className="font-mono font-semibold text-jade-900">
                      #{o.id.slice(0, 8).toUpperCase()}
                    </span>{" "}
                    · {vendorDate(o.created_at, ar)}
                  </p>
                  <span
                    className={`pill ${group === "requests" || group === "payments" ? "border-gold-300 bg-gold-50 text-gold-700" : "border-jade-900/10 bg-white"}`}
                  >
                    {vendorStatus(status, ar)}
                  </span>
                </div>
                <div className="grid gap-5 p-5 lg:grid-cols-[1fr_22rem]">
                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl text-jade-950">
                      {product?.name ?? t("Product", "المنتج")}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {customer?.full_name ?? t("Customer", "العميل")} ·{" "}
                      {product?.karat}K · {product?.weight_grams}g ·{" "}
                      {t("Qty", "الكمية")} {o.quantity}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="pill border-jade-900/10 bg-jade-50">
                        {method}
                      </span>
                      <span className="pill border-jade-900/10 bg-white">
                        {o.fulfilment_method === "collection"
                          ? t("Store pickup", "استلام من المتجر")
                          : t("Delivery", "توصيل")}
                      </span>
                      {o.identity_verification_id && (
                        <span className="pill border-jade-900/10 bg-white">
                          {t("Identity verified", "تم التحقق من الهوية")}
                        </span>
                      )}
                    </div>
                    <div className="mt-5">
                      <p className="text-xs text-ink-muted">
                        {o.vendor_confirmed_price_aed == null
                          ? t("Request estimate", "السعر التقديري للطلب")
                          : t(
                              "Confirmed customer total",
                              "الإجمالي المؤكد للعميل",
                            )}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-jade-950">
                        {formatAed(total)}
                      </p>
                    </div>
                    <details className="mt-4 rounded-xl border border-jade-900/10 p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        {t("Price & payment details", "تفاصيل السعر والدفع")}
                      </summary>
                      <dl className="mt-3 space-y-2 text-sm">
                        {[
                          [
                            t("Original request estimate", "التقدير الأصلي"),
                            formatAed(estimate),
                          ],
                          [
                            t(
                              "Get Gold fee included",
                              "رسوم Get Gold المضمّنة",
                            ),
                            formatAed(fee),
                          ],
                          [
                            t("Delivery included", "التوصيل المضمّن"),
                            formatAed(Number(snap?.delivery_fee ?? 0)),
                          ],
                          [
                            t("VAT included", "الضريبة المضمّنة"),
                            formatAed(Number(snap?.vat_aed ?? 0)),
                          ],
                          [
                            t("Payment marked sent", "تاريخ إشعار الدفع"),
                            vendorDate(o.transfer_submitted_at, ar),
                          ],
                          [
                            t("Payment confirmed", "تأكيد استلام المبلغ"),
                            vendorDate(o.payment_confirmed_at, ar),
                          ],
                          [
                            t("Payment deadline", "موعد انتهاء مهلة الدفع"),
                            vendorDate(o.payment_window_expires_at, ar),
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="flex flex-wrap justify-between gap-2"
                          >
                            <dt className="text-ink-muted">{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                      {fee > 0 && (
                        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                          {t(
                            "Collect the displayed total. The included Get Gold customer fee is settled with Get Gold separately.",
                            "حصّل الإجمالي المعروض. تتم تسوية رسوم Get Gold المضمّنة لاحقاً مع المنصة.",
                          )}
                        </p>
                      )}
                      {Number(snap?.vendor_rate_adjustment_aed ?? 0) > 0 && (
                        <p className="mt-2 text-xs">
                          {t("Store rate adjustment", "تعديل سعر المتجر")}:{" "}
                          {formatAed(Number(snap?.vendor_rate_adjustment_aed))}
                        </p>
                      )}
                      {Number(snap?.service_fee_event_discount_percent ?? 0) >
                        0 && (
                        <p className="mt-2 text-xs">
                          {snap?.marketplace_promotion_title} ·{" "}
                          {snap?.service_fee_event_discount_percent}%{" "}
                          {t("off Get Gold fee", "خصم على رسوم المنصة")}
                        </p>
                      )}
                      {subsidy > 0 && (
                        <p className="mt-2 text-xs">
                          {t("Delivery credit", "رصيد التوصيل")}:{" "}
                          {formatAed(subsidy)} ·{" "}
                          {t("Net due to Get Gold", "الصافي المستحق للمنصة")}:{" "}
                          {formatAed(fee - subsidy)}
                        </p>
                      )}
                    </details>
                    <details className="mt-3 rounded-xl border border-jade-900/10 p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        {t(
                          "Customer, address & delivery",
                          "العميل والعنوان والتوصيل",
                        )}
                      </summary>
                      <div className="mt-3">
                        <FulfilmentDetails details={o} compact />
                        {o.fulfilment_method === "delivery" &&
                          [
                            "payment_confirmed",
                            "preparing_order",
                            "ready_for_delivery",
                            "out_for_delivery",
                            "delivered",
                            "completed",
                            "paid",
                          ].includes(status) && (
                            <div className="mt-3">
                              <DeliveryAssignmentControl
                                reservationId={o.id}
                                emirate={o.delivery_emirate}
                                companies={companies ?? []}
                                assignment={
                                  assignmentByReservation.get(o.id) as any
                                }
                              />
                            </div>
                          )}
                      </div>
                    </details>
                  </div>
                  <aside className="self-start rounded-2xl border border-jade-900/10 bg-jade-50/60 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-jade-700">
                      {groupLabels[group]}
                    </p>
                    <Link
                      href={`/vendor/orders/${o.id}`}
                      className="btn-ghost mb-4 min-h-10 w-full px-3 py-2 text-xs"
                    >
                      {t("Message customer", "مراسلة العميل")}
                    </Link>
                    {group === "requests" && (
                      <VendorOrderActions
                        reservationId={o.id}
                        estimatedTotalAed={estimate}
                        availableAt={o.vendor_action_available_at}
                        arabic={ar}
                      />
                    )}
                    {group === "waiting" && (
                      <p className="text-sm leading-relaxed text-ink-muted">
                        {status === "pending_vendor_confirmation"
                          ? t(
                              "This request is queued until your store opens: ",
                              "ينتظر هذا الطلب موعد فتح متجرك: ",
                            ) + vendorDate(o.vendor_action_available_at, ar)
                          : status === "vendor_confirmed"
                            ? t(
                                "Your price has been sent. The customer needs to accept it before payment details are shown.",
                                "تم إرسال السعر. يجب على العميل قبوله قبل عرض تفاصيل الدفع.",
                              )
                            : t(
                                "Waiting for the customer to send payment. The payment window must still be valid.",
                                "بانتظار إرسال العميل للمبلغ خلال مهلة الدفع.",
                              )}
                      </p>
                    )}
                    {group === "payments" && (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed">
                          {t(
                            "Check that you received the exact amount before confirming.",
                            "تحقق من استلام المبلغ الصحيح قبل التأكيد.",
                          )}
                        </p>
                        {o.transfer_reference && (
                          <p className="break-all text-sm">
                            {t("Reference", "المرجع")}:{" "}
                            <strong>{o.transfer_reference}</strong>
                          </p>
                        )}
                        {o.transfer_proof_path && (
                          <a
                            className="btn-ghost text-xs"
                            href={`/api/reservations/bank-proof?id=${o.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("Open payment screenshot", "فتح صورة التحويل")}
                          </a>
                        )}
                        <p className="text-xs leading-relaxed text-ink-muted">
                          {t(
                            "A screenshot or reference is customer evidence. Confirm only after checking your own account or collecting payment.",
                            "الصورة أو المرجع دليل يقدمه العميل. أكد الدفع فقط بعد مراجعة حسابك أو تحصيل المبلغ.",
                          )}
                        </p>
                      </div>
                    )}
                    {["payments", "fulfilment"].includes(group) && (
                      <VendorOrderProgress
                        reservationId={o.id}
                        status={status}
                        paymentMethod={o.payment_method}
                        fulfilmentMethod={o.fulfilment_method}
                        arabic={ar}
                      />
                    )}
                    {group === "history" && (
                      <p className="text-sm text-ink-muted">
                        {status === "expired"
                          ? t(
                              "This request has expired. A new request and price confirmation are needed before payment.",
                              "انتهت مهلة هذا الطلب. يلزم طلب جديد وتأكيد السعر قبل الدفع.",
                            )
                          : t(
                              "This order is closed. Its details remain available for your records.",
                              "هذا الطلب مغلق. تبقى تفاصيله متاحة في سجلاتك.",
                            )}
                      </p>
                    )}
                    {["requests", "waiting"].includes(group) && (
                      <p className="mt-4 border-t border-jade-900/10 pt-3 text-xs text-ink-muted">
                        {t("Request expires", "تنتهي مهلة الطلب")}:{" "}
                        {vendorDate(o.expires_at, ar)}
                      </p>
                    )}
                  </aside>
                </div>
              </article>
            ),
          };
        })}
      />
      <details className="card mt-8 p-5">
        <summary className="cursor-pointer font-serif text-xl">
          {t("Store visit requests", "طلبات زيارة المتجر")}{" "}
          <span className="text-sm text-ink-muted">
            ({visits?.length ?? 0})
          </span>
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          {t(
            "Visit requests do not reserve stock or lock a price.",
            "طلبات الزيارة لا تحجز المخزون أو تثبّت السعر.",
          )}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(visits ?? []).map((visit) => (
            <article
              className="rounded-xl border border-jade-900/10 p-4"
              key={visit.id}
            >
              <h3 className="font-semibold">{one(visit.product)?.name}</h3>
              <p className="mt-1 text-sm">
                {one(visit.customer)?.full_name} · <bdi>{visit.phone}</bdi>
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                {vendorDate(visit.preferred_at, ar)} ·{" "}
                {vendorStatus(visit.status, ar)}
              </p>
              {visit.note && <p className="mt-2 text-sm">{visit.note}</p>}
              <div className="mt-3">
                <StoreVisitActions visitId={visit.id} status={visit.status} />
              </div>
            </article>
          ))}
        </div>
        {!visits?.length && (
          <p className="mt-4 text-sm text-ink-muted">
            {t("No visit requests yet.", "لا توجد طلبات زيارة بعد.")}
          </p>
        )}
      </details>
    </div>
  );
}
