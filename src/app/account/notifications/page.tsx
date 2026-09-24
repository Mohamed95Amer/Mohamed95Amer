import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getInboxSummary } from "@/lib/notifications/inbox";
import { NotificationActions } from "@/components/NotificationActions";
import { InboxRefresh } from "@/components/InboxRefresh";
import { formatDubaiDateTime } from "@/lib/presentation";
export const dynamic = "force-dynamic";
export default async function NotificationsPage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const [summary, result] = await Promise.all([
    getInboxSummary(user.id),
    getServiceSupabase()
      .from("notifications")
      .select("id, kind, title, body, href, read_at, created_at")
      .eq("user_id", user.id)
      .lte("available_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (result.error) throw new Error("Notifications could not be loaded");
  const items = [
    ...(result.data ?? []).map((n) => ({
      ...n,
      expires: null as string | null,
      promotional: false,
    })),
    ...summary.campaigns.map((c) => ({
      id: c.id,
      kind: "Promotion",
      title: (arabic && c.title_ar) || c.title,
      body: (arabic && c.body_ar) || c.body,
      href: c.href,
      read_at: c.read_at,
      created_at: c.starts_at,
      expires: c.ends_at,
      promotional: true,
    })),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <main className="container-pro max-w-4xl py-10 sm:py-14">
      <InboxRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-jade-600">
            {arabic ? "كل جديد يهمك" : "Updates that matter"}
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">
            {arabic ? "الإشعارات" : "Notifications"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {summary.unread}{" "}
            {arabic
              ? "غير مقروءة · آخر 100 تحديث للطلبات والعروض السارية."
              : "unread · Latest 100 order updates and current promotions."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationActions arabic={arabic} />
          <Link href="/account/preferences" className="btn-ghost">
            {arabic ? "التفضيلات" : "Preferences"}
          </Link>
        </div>
      </div>
      <div className="mt-7 space-y-3">
        {items.map((item) => (
          <article
            key={(item.promotional ? "ad-" : "") + item.id}
            className={`card p-5 ${item.read_at ? "" : "border-gold-300/60"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-jade-600">
                  {item.promotional
                    ? arabic
                      ? "إعلان · عرض لفترة محدودة"
                      : "Ad · Limited-time offer"
                    : item.kind.replaceAll("_", " ")}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-jade-950">
                  {item.title}
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                  {item.body}
                </p>
                <p className="mt-2 text-xs text-ink-muted">
                  {item.expires
                    ? (arabic ? "ينتهي " : "Expires ") +
                      formatDubaiDateTime(item.expires)
                    : formatDubaiDateTime(item.created_at)}
                </p>
              </div>
              {!item.read_at && (
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold-400" />
              )}
            </div>
            <div className="mt-3 flex items-center gap-4">
              {item.href && (
                <Link
                  href={item.href}
                  className="text-xs font-semibold text-jade-700 underline underline-offset-4"
                >
                  {arabic ? "عرض التفاصيل" : "Open update"}
                </Link>
              )}
              <NotificationActions
                {...(item.promotional
                  ? { campaignId: item.id }
                  : { id: item.id })}
                unread={!item.read_at}
                arabic={arabic}
              />
            </div>
          </article>
        ))}
        {!items.length && (
          <div className="card p-8 text-center">
            <h2 className="font-serif text-2xl">
              {arabic ? "لا توجد إشعارات حالياً" : "All quiet for now"}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              {arabic
                ? "ستظهر تحديثات طلباتك هنا. يمكنك تفعيل العروض من التفضيلات."
                : "Order updates appear here. Enable promotional updates in Preferences to receive offers."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
