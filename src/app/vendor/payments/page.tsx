import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { BankSettingsForm } from "./BankSettingsForm";
export const dynamic = "force-dynamic";
export default async function VendorPaymentsPage() {
  const user = await requireUser(); const admin = getServiceSupabase();
  const { data: vendor } = await admin.from("vendors").select("id, verification_status").eq("owner_user_id", user.id).maybeSingle();
  if (!vendor) redirect("/vendor/register");
  const [{ data }, { data: hours }] = await Promise.all([
    admin.from("vendor_payment_settings").select("aani_enabled, aani_mobile, bank_transfer_enabled, bank_name, beneficiary_name, iban, cash_enabled, card_enabled, delivery_mode, courier_name, delivery_fee_aed").eq("vendor_id", vendor.id).maybeSingle(),
    admin.from("vendor_working_hours").select("day_of_week, is_open, opens_at, closes_at").eq("vendor_id", vendor.id).order("day_of_week"),
  ]);
  return <div className="container-pro py-10"><h1 className="font-serif text-3xl">Store payments & hours</h1><p className="mt-2 text-sm text-ink-muted">Customers request first. You confirm availability and the final price before Aani or bank details are shown.</p><VendorNav />{vendor.verification_status === "approved" ? <BankSettingsForm initial={data ?? { aani_enabled: false, aani_mobile: "", bank_transfer_enabled: false, bank_name: "", beneficiary_name: "", iban: "" }} initialHours={hours ?? []} /> : <p className="mt-6">Store approval is required before enabling payment options.</p>}</div>;
}
