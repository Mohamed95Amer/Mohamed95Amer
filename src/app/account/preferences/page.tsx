import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { NotificationPreferencesForm } from "@/components/NotificationPreferencesForm";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const user = await requireUser(); const { data } = await getServiceSupabase().from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
  const initial = data ?? { language: "en", in_app_notifications: true, email_notifications: true, sms_notifications: false, whatsapp_notifications: false, marketing_notifications: false };
  return <main className="container-pro max-w-3xl py-10 sm:py-14"><p className="eyebrow text-jade-600">Your communication choices</p><h1 className="mt-1 font-serif text-4xl font-semibold text-jade-950">Language & notifications</h1><p className="mt-2 text-sm leading-relaxed text-ink-muted">Control how Get Gold contacts you. Mandatory security and transaction records stay in your account even if external channels are off.</p><NotificationPreferencesForm initial={initial} /></main>;
}

