import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, shortId, statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const admin = getServiceSupabase();
  const { data } = await admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, actor_role, actor_user_id, ip_address, created_at, new_value")
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-bone-soft text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">When</th>
            <th className="px-4 py-2 text-left">Actor</th>
            <th className="px-4 py-2 text-left">Action</th>
            <th className="px-4 py-2 text-left">Entity</th>
            <th className="px-4 py-2 text-left">IP</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className="border-t border-bone-deep">
              <td className="px-4 py-2 text-ink-muted">{formatDubaiDateTime(e.created_at)}</td>
              <td className="px-4 py-2">{statusLabel(e.actor_role ?? "system")}</td>
              <td className="px-4 py-2 font-mono text-xs">{e.action.replaceAll("_", " ")}</td>
              <td className="px-4 py-2 text-ink-muted" title={e.entity_id ?? undefined}>{e.entity_type}/{shortId(e.entity_id)}</td>
              <td className="px-4 py-2 text-ink-muted">{e.ip_address ?? "—"}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">No audit events.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
