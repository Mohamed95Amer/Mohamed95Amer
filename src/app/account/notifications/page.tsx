import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { NotificationActions } from "@/components/NotificationActions";
import { formatDubaiDateTime } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser(); const { data: notifications } = await getServiceSupabase().from("notifications").select("id, kind, title, body, href, read_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100); const unread = (notifications ?? []).filter((item) => !item.read_at).length;
  return <main className="container-pro max-w-4xl py-10 sm:py-14"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-jade-600">Updates that matter</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">Notifications</h1><p className="mt-2 text-sm text-ink-muted">{unread} unread · order, offer, price and delivery updates in one place.</p></div><div className="flex items-center gap-3"><NotificationActions /><Link href="/account/preferences" className="btn-ghost">Preferences</Link></div></div><div className="mt-7 space-y-3">{(notifications ?? []).map((item) => <article key={item.id} className={`card p-5 ${item.read_at ? "opacity-70" : "border-gold-300/40"}`}><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-jade-600">{item.kind.replaceAll("_", " ")}</p><h2 className="mt-1 font-serif text-xl font-semibold text-jade-950">{item.title}</h2><p className="mt-2 text-sm text-ink-muted">{item.body}</p><p className="mt-2 text-[11px] text-ink-muted">{formatDubaiDateTime(item.created_at)}</p></div>{!item.read_at && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold-400" />}</div><div className="mt-4 flex items-center gap-4">{item.href && <Link href={item.href} className="text-xs font-semibold text-jade-700 underline underline-offset-4">Open update</Link>}<NotificationActions id={item.id} unread={!item.read_at} /></div></article>)}{(notifications ?? []).length === 0 && <div className="card p-8 text-center"><h2 className="font-serif text-2xl text-jade-950">All quiet for now</h2><p className="mt-2 text-sm text-ink-muted">New order, offer, price-alert and delivery updates will appear here.</p></div>}</div></main>;
}

