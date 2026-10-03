import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatAed } from "@/lib/pricing/calc";
import { vendorDate, vendorStatus } from "@/lib/vendor-workspace";
import { OrderConversation } from "@/components/OrderConversation";

export const dynamic = "force-dynamic";

export default async function VendorOrderConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user, cookieStore] = await Promise.all([
    params,
    requireUser(),
    cookies(),
  ]);
  const arabic = cookieStore.get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");
  const { data: order } = await admin
    .from("reservations")
    .select(
      "id, vendor_id, status, expires_at, created_at, quantity, vendor_confirmed_price_aed, payment_method, customer:profiles!reservations_customer_user_id_fkey(full_name), product:products(name, karat, weight_grams), snapshot:order_price_snapshots(total_price_aed)",
    )
    .eq("id", id)
    .eq("vendor_id", vendor.id)
    .maybeSingle();
  if (!order) notFound();
  const one = <T,>(value: T | T[] | null) =>
    Array.isArray(value) ? value[0] : value;
  const customer = one(order.customer);
  const product = one(order.product);
  const snapshot = one(order.snapshot);
  const total = Number(
    order.vendor_confirmed_price_aed ?? snapshot?.total_price_aed ?? 0,
  );
  const canSendPaymentLink =
    order.status === "payment_pending" &&
    Date.parse(order.expires_at) > Date.now();

  return (
    <div
      className="container-pro max-w-4xl py-8 sm:py-12"
      dir={arabic ? "rtl" : "ltr"}
    >
      <Link
        href="/vendor/orders"
        className="text-sm font-semibold text-jade-700"
      >
        {t("← Back to all orders", "العودة إلى كل الطلبات ←")}
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-jade-600">
            {t("Order conversation", "محادثة الطلب")}
          </p>
          <h1 className="mt-2 font-serif text-3xl text-jade-950 sm:text-4xl">
            {product?.name ?? t("Gold item", "قطعة ذهب")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {customer?.full_name ?? t("Customer", "العميل")} · #
            {order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <span className="pill border-jade-900/10 bg-jade-50">
          {vendorStatus(order.status, arabic)}
        </span>
      </div>
      <section className="card mt-6 grid gap-4 p-5 text-sm sm:grid-cols-4">
        <div>
          <span className="label">{t("Item", "المنتج")}</span>
          <p className="mt-2">
            {product?.karat}K · {product?.weight_grams}g
          </p>
        </div>
        <div>
          <span className="label">{t("Quantity", "الكمية")}</span>
          <p className="mt-2">{order.quantity}</p>
        </div>
        <div>
          <span className="label">
            {t("Confirmed total", "الإجمالي المؤكد")}
          </span>
          <p className="mt-2 font-semibold">{formatAed(total)}</p>
        </div>
        <div>
          <span className="label">{t("Payment deadline", "موعد الدفع")}</span>
          <p className="mt-2">{vendorDate(order.expires_at, arabic)}</p>
        </div>
      </section>
      <div className="mt-6">
        <OrderConversation
          reservationId={order.id}
          viewerRole="vendor"
          canSendPaymentLink={canSendPaymentLink}
          arabic={arabic}
        />
      </div>
      <p className="mt-4 rounded-xl border border-gold-300/40 bg-gold-50 p-4 text-xs leading-relaxed text-ink-muted">
        {t(
          "A payment link is enabled only after the customer accepts your confirmed price. Sending it does not prove payment. Check your own payment provider or bank account before confirming receipt from the orders page.",
          "يتاح رابط الدفع فقط بعد قبول العميل للسعر المؤكد. إرسال الرابط لا يثبت الدفع. تحقق من حساب مزود الدفع أو البنك قبل تأكيد الاستلام من صفحة الطلبات.",
        )}
      </p>
    </div>
  );
}
