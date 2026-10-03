import { getServiceSupabase } from "@/lib/supabase/server";

export interface AuditEntry {
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string | null;
}

function normalise(entry: AuditEntry) {
  return {
    ...entry,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    ip_address: entry.ip_address ?? null,
  };
}

export async function logAudit(params: AuditEntry) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_logs").insert(normalise(params));
  } catch {
    // best-effort
  }
}

/**
 * Write several entries in one statement.
 *
 * A bulk import creates up to a few hundred products; calling logAudit per
 * product would turn one request into that many round trips, which is slow
 * enough to time out the request that the products were already inserted by.
 * Still best-effort: an audit write must never be the reason a vendor's
 * upload reports failure after the products landed.
 */
export async function logAuditMany(entries: AuditEntry[]) {
  if (entries.length === 0) return;
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_logs").insert(entries.map(normalise));
  } catch {
    // best-effort
  }
}
