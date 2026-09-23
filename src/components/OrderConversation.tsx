"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { paymentLinkHost, type OrderMessage } from "@/lib/order-messages";

export function OrderConversation({
  reservationId,
  viewerRole,
  canSendPaymentLink = false,
  arabic = false,
}: {
  reservationId: string;
  viewerRole: "customer" | "vendor";
  canSendPaymentLink?: boolean;
  arabic?: boolean;
}) {
  const t = (en: string, ar: string) => (arabic ? ar : en);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [body, setBody] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  function merge(incoming: OrderMessage[]) {
    setMessages((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of incoming) byId.set(item.id, item);
      return [...byId.values()].sort(
        (a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) ||
          a.id.localeCompare(b.id),
      );
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(
          `/api/orders/messages?reservationId=${reservationId}`,
          { cache: "no-store" },
        );
        const json = await response.json();
        if (!cancelled && response.ok) merge(json.messages as OrderMessage[]);
      } catch {
        if (!cancelled)
          setError(
            t(
              "Messages could not refresh. You can retry by reopening this order.",
              "تعذر تحديث الرسائل. أعد فتح الطلب للمحاولة مجدداً.",
            ),
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void refresh();
    const poll = window.setInterval(refresh, 15_000);
    let disconnect: (() => void) | null = null;
    const connect = window.setTimeout(async () => {
      const { getBrowserSupabase } = await import("@/lib/supabase/browser");
      if (cancelled) return;
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel(`order_messages_${reservationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "order_messages",
            filter: `reservation_id=eq.${reservationId}`,
          },
          (payload) => merge([payload.new as OrderMessage]),
        )
        .subscribe();
      disconnect = () => {
        void supabase.removeChannel(channel);
      };
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(connect);
      disconnect?.();
    };
    // The language is presentation-only and must not reconnect the conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  useEffect(() => {
    if (messages.length > 0)
      endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          messageType: linkMode ? "payment_link" : "text",
          body,
          paymentUrl: linkMode ? paymentUrl : null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          json.error ?? t("Message could not be sent.", "تعذر إرسال الرسالة."),
        );
        return;
      }
      merge([json.message as OrderMessage]);
      setBody("");
      setPaymentUrl("");
      setLinkMode(false);
    } catch {
      setError(
        t(
          "Connection failed. Your message was not sent.",
          "تعذر الاتصال. لم تُرسل رسالتك.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="messages" className="card scroll-mt-32 overflow-hidden">
      <div className="border-b border-jade-900/10 bg-bone-soft px-5 py-4 sm:px-6">
        <p className="eyebrow text-jade-600">
          {t("Private order conversation", "محادثة الطلب الخاصة")}
        </p>
        <h2 className="mt-1 font-serif text-2xl text-jade-950">
          {t("Message the other party", "راسل الطرف الآخر")}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          {t(
            "This conversation is visible only to the customer, this store and authorised Get Gold administrators.",
            "هذه المحادثة متاحة فقط للعميل وهذا المتجر ومسؤولي Get Gold المخولين.",
          )}
        </p>
      </div>
      <div
        className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto px-4 py-5 sm:px-6"
        aria-live="polite"
      >
        {loading && messages.length === 0 && (
          <p className="text-sm text-ink-muted">
            {t("Loading conversation…", "جارٍ تحميل المحادثة…")}
          </p>
        )}
        {!loading && messages.length === 0 && (
          <div className="py-5 text-center">
            <p className="font-serif text-xl text-jade-950">
              {t("No messages yet", "لا توجد رسائل بعد")}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {t(
                "Use this space for questions about this order only.",
                "استخدم هذه المساحة للاستفسارات المتعلقة بهذا الطلب فقط.",
              )}
            </p>
          </div>
        )}
        {messages.map((message) => {
          const mine = message.sender_role === viewerRole;
          return (
            <article
              key={message.id}
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${mine ? "ms-auto bg-jade-900 text-white" : "me-auto border border-jade-900/10 bg-white text-ink"}`}
            >
              <div
                className={`mb-1 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.1em] ${mine ? "text-white/60" : "text-ink-muted"}`}
              >
                <span>
                  {mine
                    ? t("You", "أنت")
                    : message.sender_role === "vendor"
                      ? t("Store", "المتجر")
                      : t("Customer", "العميل")}
                </span>
                <time dateTime={message.created_at}>
                  {formatMessageTime(message.created_at, arabic)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words leading-relaxed">
                {message.body}
              </p>
              {message.message_type === "payment_link" &&
                message.payment_url && (
                  <div
                    className={`mt-3 rounded-xl p-3 ${mine ? "bg-white/10" : "bg-gold-50"}`}
                  >
                    <p
                      className={`text-[11px] ${mine ? "text-white/70" : "text-ink-muted"}`}
                    >
                      {t("Vendor payment page", "صفحة دفع المتجر")} ·{" "}
                      {paymentLinkHost(message.payment_url)}
                    </p>
                    <a
                      href={message.payment_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      referrerPolicy="no-referrer"
                      className={`mt-2 inline-flex min-h-10 items-center rounded-full px-4 py-2 text-xs font-semibold ${mine ? "bg-white text-jade-950" : "bg-jade-900 text-white"}`}
                    >
                      {t(
                        "Open vendor payment page ↗",
                        "فتح صفحة الدفع الخاصة بالمتجر ↗",
                      )}
                    </a>
                    <p
                      className={`mt-2 text-[10px] leading-relaxed ${mine ? "text-white/65" : "text-ink-muted"}`}
                    >
                      {t(
                        "Payment goes directly to the store. Opening this link does not confirm payment on Get Gold.",
                        "يذهب الدفع مباشرة إلى المتجر. فتح الرابط لا يؤكد الدفع في Get Gold.",
                      )}
                    </p>
                  </div>
                )}
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="space-y-3 border-t border-jade-900/10 bg-white p-4 sm:p-6"
        onSubmit={send}
      >
        {viewerRole === "vendor" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {canSendPaymentLink
                ? t(
                    "The accepted-price payment window is active.",
                    "مهلة دفع السعر المقبول نشطة.",
                  )
                : t(
                    "Payment links unlock after the customer accepts your confirmed price.",
                    "تتاح روابط الدفع بعد قبول العميل للسعر المؤكد.",
                  )}
            </p>
            <button
              type="button"
              disabled={!canSendPaymentLink}
              aria-pressed={linkMode}
              onClick={() => setLinkMode((value) => !value)}
              className="btn-ghost min-h-9 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {linkMode
                ? t("Send normal message", "إرسال رسالة عادية")
                : t("＋ Add payment link", "＋ إضافة رابط دفع")}
            </button>
          </div>
        )}
        {linkMode && (
          <label className="block">
            <span className="label">
              {t("Secure HTTPS payment link", "رابط دفع HTTPS آمن")}
            </span>
            <input
              className="input mt-1"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={2000}
              placeholder="https://payment-provider.example/..."
              value={paymentUrl}
              onChange={(event) => setPaymentUrl(event.target.value)}
            />
          </label>
        )}
        <label className="block">
          <span className="label">
            {linkMode
              ? t("Payment instructions", "تعليمات الدفع")
              : t("Message", "الرسالة")}
          </span>
          <textarea
            className="input mt-1 min-h-24 resize-y"
            required
            minLength={1}
            maxLength={2000}
            placeholder={
              linkMode
                ? t(
                    "Explain what the customer should check before paying.",
                    "اشرح ما يجب على العميل التحقق منه قبل الدفع.",
                  )
                : t(
                    "Write a message about this order…",
                    "اكتب رسالة عن هذا الطلب…",
                  )
            }
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {linkMode && (
          <p className="rounded-xl border border-gold-300/40 bg-gold-50 p-3 text-xs leading-relaxed text-ink-muted">
            {t(
              "The customer has already accepted your final price. This link is recorded as vendor-provided and never marks the order paid automatically. Confirm payment only after checking your own provider or bank account.",
              "وافق العميل على سعرك النهائي. يُسجل الرابط كرابط مقدم من المتجر ولا يؤكد الدفع تلقائياً. أكد الدفع فقط بعد مراجعة حساب مزود الدفع أو البنك.",
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-ink-muted">{body.length}/2000</p>
          <button
            className="btn-primary min-h-11 px-5"
            disabled={busy || !body.trim()}
          >
            {busy
              ? t("Sending…", "جارٍ الإرسال…")
              : linkMode
                ? t("Send payment link", "إرسال رابط الدفع")
                : t("Send message", "إرسال الرسالة")}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-signal-err">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

function formatMessageTime(value: string, arabic: boolean) {
  return new Intl.DateTimeFormat(arabic ? "ar-AE" : "en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
