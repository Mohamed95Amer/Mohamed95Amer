import { getServiceSupabase } from "@/lib/supabase/server";

export async function logAudit(params: {
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string | null;
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("audit_logs").insert({
      ...params,
      old_value: params.old_value ?? null,
      new_value: params.new_value ?? null,
      ip_address: params.ip_address ?? null,
    });
  } catch {
    // best-effort
  }
}
