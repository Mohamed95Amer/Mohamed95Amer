import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, shortId, statusLabel } from "@/lib/presentation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = (en: string, ar: string) => arabic ? ar : en;
  const admin = getServiceSupabase();
  const { data } = await admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, actor_role, actor_user_id, ip_address, created_at, new_value")
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <div className="card overflow-x-auto" dir={arabic ? "rtl" : "ltr"}>
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-start">{t("When", "الوقت")}</th>
            <th className="px-4 py-2 text-start">{t("Actor", "المنفذ")}</th>
            <th className="px-4 py-2 text-start">{t("Action", "الإجراء")}</th>
            <th className="px-4 py-2 text-start">{t("Entity", "العنصر")}</th>
            <th className="px-4 py-2 text-start">{t("IP", "عنوان IP")}</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className="border-t border-bone-deep">
              <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(e.created_at)}</td>
              <td className="px-4 py-2">{arabic ? ({ system: "النظام", admin: "مسؤول", super_admin: "مالك المنصة", vendor: "متجر", customer: "عميل", delivery_company: "شركة توصيل" } as Record<string,string>)[e.actor_role ?? "system"] ?? statusLabel(e.actor_role ?? "system") : statusLabel(e.actor_role ?? "system")}</td>
              <td className="px-4 py-2 font-mono text-xs">{e.action.replaceAll("_", " ")}</td>
              <td className="px-4 py-2 text-ink-muted" title={e.entity_id ?? undefined}>{e.entity_type}/{shortId(e.entity_id)}</td>
              <td className="px-4 py-2 text-ink-muted">{e.ip_address ?? "—"}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">{t("No audit events.", "لا توجد أحداث تدقيق.")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
