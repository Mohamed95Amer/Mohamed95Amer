"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { campaignStatus, type Campaign } from "@/lib/notifications/campaigns";
import { formatDubaiDateTime } from "@/lib/presentation";
const dubaiInput = (date: string) =>
  new Date(Date.parse(date) + 4 * 3600000).toISOString().slice(0, 16);
export function CampaignManager({
  campaigns,
  arabic,
}: {
  campaigns: Campaign[];
  arabic: boolean;
}) {
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const router = useRouter(),
    [editing, setEditing] = useState<Campaign | null>(null),
    [formKey, setFormKey] = useState(0);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [confirm, setConfirm] = useState<{
    id: string;
    action: "publish" | "cancel";
  } | null>(null);
  const [duration, setDuration] = useState(7);
  async function mutate(payload: object) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/notification-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      router.refresh();
      setConfirm(null);
      setMessage(
        t(
          "Saved. No email or SMS was sent.",
          "تم الحفظ. لم يتم إرسال بريد أو رسالة نصية.",
        ),
      );
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : t("Could not save. Retry.", "تعذر الحفظ."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setEditing(null);
    setFormKey((k) => k + 1);
    setTitle("");
    setBody("");
    setDraftId(crypto.randomUUID());
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const start = new Date(String(f.get("start")) + "+04:00");
    const values = {
      title,
      body,
      title_ar: String(f.get("title_ar")),
      body_ar: String(f.get("body_ar")),
      href: String(f.get("href")),
      audience: String(f.get("audience")),
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + duration * 86400000).toISOString(),
    };
    if (
      await mutate({
        action: editing ? "update" : "create",
        id: editing?.id ?? draftId,
        values,
      })
    )
      reset();
  }
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-jade-950 p-6 text-white sm:p-8">
        <p className="text-xs uppercase tracking-widest text-gold-200">
          {t("Customer communication", "التواصل مع العملاء")}
        </p>
        <h2 className="mt-2 font-serif text-3xl">
          {t(
            "A timely offer. A quieter inbox.",
            "عرض في وقته. وإشعارات أكثر تنظيماً.",
          )}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
          {t(
            "Create in-app promotions with a clear start and expiry. Only customers who opted in will see them. Order updates stay separate and never expire with an ad.",
            "أنشئ عروضاً داخل الموقع بوقت بداية ونهاية واضحين. تظهر فقط للعملاء الذين وافقوا على تلقي العروض. تحديثات الطلبات منفصلة ولا تنتهي بانتهاء الإعلان.",
          )}
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <form
          key={formKey}
          onSubmit={submit}
          className="card space-y-4 p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-serif text-2xl">
              {editing
                ? t("Edit draft", "تعديل المسودة")
                : t("New promotion", "عرض جديد")}
            </h3>
            {editing && (
              <button type="button" className="btn-ghost" onClick={reset}>
                {t("New draft", "مسودة جديدة")}
              </button>
            )}
          </div>
          <label className="block text-sm">
            {t("Title", "العنوان")}
            <input
              className="input mt-1 w-full"
              required
              minLength={2}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t("Message", "الرسالة")}
            <textarea
              className="input mt-1 w-full"
              required
              minLength={2}
              maxLength={600}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <details className="rounded-xl border border-bone-deep p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {t("Arabic copy (optional)", "النص العربي (اختياري)")}
            </summary>
            <label className="mt-3 block text-sm">
              {t("Arabic title", "العنوان بالعربية")}
              <input
                dir="rtl"
                name="title_ar"
                defaultValue={editing?.title_ar ?? ""}
                maxLength={120}
                className="input mt-1 w-full"
              />
            </label>
            <label className="mt-3 block text-sm">
              {t("Arabic message", "الرسالة بالعربية")}
              <textarea
                dir="rtl"
                name="body_ar"
                defaultValue={editing?.body_ar ?? ""}
                maxLength={600}
                className="input mt-1 w-full"
              />
            </label>
          </details>
          <label className="block text-sm">
            {t("Open this website page", "صفحة العرض داخل الموقع")}
            <input
              name="href"
              className="input mt-1 w-full"
              required
              defaultValue={editing?.href ?? "/marketplace"}
              placeholder="/marketplace"
              dir="ltr"
            />
            <span className="mt-1 block text-xs text-ink-muted">
              {t(
                "Internal paths only. This message does not create a price discount.",
                "روابط داخلية فقط. هذه الرسالة لا تنشئ خصماً على السعر.",
              )}{" "}
              <Link href="/admin/marketing" className="underline">
                {t("Manage discounts", "إدارة الخصومات")}
              </Link>
            </span>
          </label>
          <label className="block text-sm">
            {t("Audience", "الجمهور")}
            <select
              name="audience"
              className="input mt-1 w-full"
              defaultValue={editing?.audience ?? "customers"}
            >
              <option value="customers">
                {t(
                  "All opted-in customers",
                  "جميع العملاء الموافقين على العروض",
                )}
              </option>
              <option value="buyers">
                {t("Customers with a paid order", "عملاء لديهم طلب مدفوع")}
              </option>
              <option value="new_customers">
                {t(
                  "Customers without a paid order",
                  "عملاء لم يسددوا أي طلب بعد",
                )}
              </option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              {t("Starts (Dubai time)", "البداية (توقيت دبي)")}
              <input
                required
                type="datetime-local"
                name="start"
                className="input mt-1 w-full min-w-0"
                defaultValue={dubaiInput(
                  editing?.starts_at ?? new Date().toISOString(),
                )}
              />
            </label>
            <label className="block text-sm">
              {t("Visible for", "مدة الظهور")}
              <select
                className="input mt-1 w-full"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[1, 3, 7, 14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} {t("days", "أيام")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs leading-5 text-ink-muted">
            {t(
              "Audience eligibility is checked whenever a customer opens the inbox. Saving creates a draft; publish it separately when ready. Live messages cannot be edited—cancel and replace them.",
              "تُراجع أهلية الجمهور عند فتح الإشعارات. الحفظ ينشئ مسودة؛ انشرها عندما تكون جاهزاً. لإجراء تعديل بعد النشر، ألغِ الإعلان وأنشئ بديلاً.",
            )}
          </p>
          <button className="btn-primary" disabled={busy}>
            {busy
              ? t("Saving…", "جارٍ الحفظ…")
              : t("Save draft", "حفظ المسودة")}
          </button>
        </form>
        <div className="space-y-5">
          <section className="card border-gold-300/50 p-6">
            <p className="eyebrow text-jade-700">
              {t("Inbox preview · Ad", "معاينة الإشعار · إعلان")}
            </p>
            <h3 className="mt-3 break-words font-serif text-2xl">
              {title || t("Your promotion title", "عنوان العرض")}
            </h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-muted">
              {body ||
                t(
                  "A short, useful message with one clear reason to explore.",
                  "رسالة قصيرة ومفيدة تدعو العميل للاطلاع على العرض.",
                )}
            </p>
            <p className="mt-4 text-xs text-ink-muted">
              {t("Automatically hidden after", "يختفي تلقائياً بعد")} {duration}{" "}
              {t("days from the start", "أيام من البداية")}
            </p>
          </section>
          <div className="rounded-2xl bg-jade-50 p-5 text-sm leading-6">
            <h3 className="font-semibold">
              {t("Before you publish", "قبل النشر")}
            </h3>
            <p>
              {t(
                "Check the linked offer and its dates. This reaches the website inbox only—not email, SMS, WhatsApp or browser push. Customers can opt out in Preferences.",
                "راجع العرض المرتبط وتواريخه. الظهور في إشعارات الموقع فقط، وليس عبر البريد أو الرسائل النصية أو واتساب أو إشعارات المتصفح. يمكن للعملاء إلغاء الاشتراك من التفضيلات.",
              )}
            </p>
          </div>
        </div>
      </div>
      {message && (
        <p role="status" className="card p-4 text-sm">
          {message}
        </p>
      )}
      {confirm && (
        <section role="alert" className="card border-gold-400 p-5">
          <h3 className="font-semibold">
            {confirm.action === "publish"
              ? t(
                  "Publish this promotion to eligible customers?",
                  "نشر العرض للعملاء المؤهلين؟",
                )
              : t(
                  "Cancel this promotion and remove it from customer inboxes?",
                  "إلغاء العرض وإخفاؤه من إشعارات العملاء؟",
                )}
          </h3>
          <div className="mt-3 flex gap-3">
            <button
              disabled={busy}
              className="btn-primary"
              onClick={() => mutate(confirm)}
            >
              {t("Confirm", "تأكيد")}
            </button>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t("Go back", "رجوع")}
            </button>
          </div>
        </section>
      )}
      <section>
        <h3 className="mb-4 font-serif text-2xl">
          {t("Campaign library", "مكتبة الحملات")}{" "}
          <span className="text-sm text-ink-muted">({campaigns.length})</span>
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((c) => {
            const status = campaignStatus(c);
            return (
              <article key={c.id} className="card p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h4 className="break-words font-semibold">{c.title}</h4>
                  <span className="rounded-full bg-jade-50 px-3 py-1 text-xs text-jade-800">
                    {arabic
                      ? {
                          Draft: "مسودة",
                          Live: "سارية",
                          Scheduled: "مجدولة",
                          Expired: "منتهية",
                          Cancelled: "ملغاة",
                        }[status]
                      : status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                  {c.body}
                </p>
                <p className="mt-3 text-xs text-ink-muted">
                  {formatDubaiDateTime(c.starts_at)} →{" "}
                  {formatDubaiDateTime(c.ends_at)}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {status === "Draft" && (
                    <>
                      <button
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditing(c);
                          setTitle(c.title);
                          setBody(c.body);
                          setDuration(
                            Math.round(
                              (Date.parse(c.ends_at) -
                                Date.parse(c.starts_at)) /
                                86400000,
                            ),
                          );
                          setFormKey((k) => k + 1);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        {t("Edit draft", "تعديل المسودة")}
                      </button>
                      <button
                        className="btn-primary"
                        disabled={busy}
                        onClick={() =>
                          setConfirm({ id: c.id, action: "publish" })
                        }
                      >
                        {t("Publish", "نشر")}
                      </button>
                    </>
                  )}
                  {!["Cancelled", "Expired"].includes(status) && (
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => setConfirm({ id: c.id, action: "cancel" })}
                    >
                      {t("Cancel campaign", "إلغاء الحملة")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!campaigns.length && (
          <div className="card p-8 text-center text-ink-muted">
            {t(
              "No promotions yet. Your first draft will appear here.",
              "لا توجد عروض بعد. ستظهر مسودتك الأولى هنا.",
            )}
          </div>
        )}
      </section>
    </div>
  );
}
