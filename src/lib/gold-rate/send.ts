import { env } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";
import { loadRateSnapshot } from "./data";
import { formatRateAed, formatSignedPct, rateKaratByKarat, ratePath, summarizeKaratRate } from "./core";
import { isAlertDue } from "./subscriptions";

/**
 * Sends due gold-rate emails through Resend. Sending is switched off (the run
 * reports `disabled`) until RESEND_API_KEY and RATE_ALERT_FROM_EMAIL are set,
 * so sign-ups can be collected before an email provider is connected.
 */
export async function sendDueRateAlerts(limit = 200) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RATE_ALERT_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { status: "disabled" as const, sent: 0 };

  const admin = getServiceSupabase();
  const { data: subs, error } = await admin
    .from("rate_alert_subscriptions")
    .select("id, email, karat, frequency, target_rate_aed, locale, unsubscribe_token, last_sent_at")
    .eq("active", true)
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return { status: "error" as const, sent: 0, error: error.message };

  const snapshot = await loadRateSnapshot();
  if (!(snapshot.price24k > 0)) return { status: "no_price" as const, sent: 0 };
  const now = new Date();
  const base = env.siteUrl();
  let sent = 0;
  let failed = 0;

  for (const sub of subs ?? []) {
    const karat = rateKaratByKarat(Number(sub.karat));
    if (!karat) continue;
    const summary = summarizeKaratRate(snapshot.history, snapshot.price24k, karat, snapshot.today);
    const due = isAlertDue({ frequency: sub.frequency as "daily" | "target", target_rate_aed: sub.target_rate_aed == null ? null : Number(sub.target_rate_aed), last_sent_at: sub.last_sent_at }, summary.current, now);
    if (!due) continue;
    const locale = sub.locale === "ar" ? "ar" : "en";
    const pageUrl = `${base}${ratePath(locale, karat.slug)}`;
    const unsubscribeUrl = `${base}/api/rate-alerts/unsubscribe?token=${sub.unsubscribe_token}`;
    const rate = formatRateAed(summary.current, locale);
    const change = formatSignedPct(summary.changePercent, locale);
    const targetHit = sub.frequency === "target";
    const subject = locale === "ar"
      ? (targetHit ? `وصل سعر الذهب عيار ${karat.karat} إلى هدفك: ${rate}` : `سعر الذهب عيار ${karat.karat} اليوم: ${rate} للغرام`)
      : (targetHit ? `${karat.karat}K gold reached your target: ${rate}/g` : `${karat.karat}K gold rate today: ${rate}/g (${change})`);
    const lines = locale === "ar"
      ? [`سعر غرام الذهب عيار ${karat.karat} الآن: ${rate} (${change} مقارنة بالأمس).`, "السعر لا يشمل المصنعية أو الضريبة. قارن المصنعية بين المحلات الموثّقة:", pageUrl]
      : [`${karat.karat}K gold is now ${rate} per gram (${change} vs yesterday).`, "The rate excludes making charges and VAT. Compare making charges across verified stores:", pageUrl];
    const footer = locale === "ar" ? "لإلغاء الاشتراك:" : "Unsubscribe:";
    const html = `<div dir="${locale === "ar" ? "rtl" : "ltr"}" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1F2A27"><p style="font-family:Georgia,serif;font-size:20px;color:#072F28;margin:0 0 12px">GET GOLD</p><p style="font-size:26px;font-weight:bold;color:#072F28;margin:0">${escapeHtml(rate)}</p><p>${escapeHtml(lines[0])}</p><p>${escapeHtml(lines[1])}</p><p><a href="${pageUrl}" style="display:inline-block;background:#104D36;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${locale === "ar" ? "قارن المصنعية" : "Compare making charges"}</a></p><p style="font-size:12px;color:#5A6662;margin-top:24px">${footer} <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p></div>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [sub.email],
        subject,
        html,
        text: `${lines.join("\n")}\n\n${footer} ${unsubscribeUrl}`,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
    }).catch(() => null);
    if (!response?.ok) { failed += 1; continue; }
    sent += 1;
    await admin.from("rate_alert_subscriptions").update({ last_sent_at: now.toISOString(), last_sent_rate_aed: summary.current, updated_at: now.toISOString() }).eq("id", sub.id);
  }
  return { status: "ok" as const, sent, failed };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
