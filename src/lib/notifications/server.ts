import { getServiceSupabase } from "@/lib/supabase/server";

export type NotificationKind = "order" | "offer" | "price_alert" | "delivery" | "inventory" | "account" | "system";

export async function notifyUser(input: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string | null;
  dedupeKey?: string | null;
  availableAt?: string | null;
}) {
  const admin = getServiceSupabase();
  const values = {
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    dedupe_key: input.dedupeKey ?? null,
    available_at: input.availableAt ?? new Date().toISOString(),
  };
  const query = input.dedupeKey
    ? admin.from("notifications").upsert(values, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    : admin.from("notifications").insert(values);
  const { error } = await query;
  if (error) console.error("notification_write_failed", error.message);
}
