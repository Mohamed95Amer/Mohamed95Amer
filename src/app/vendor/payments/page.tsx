import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { BankSettingsForm } from "./BankSettingsForm";
export const dynamic = "force-dynamic";
export default async function VendorPaymentsPage() {
  const user = await requireUser();
  const ar = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data: vendor, error } = await admin.from("vendors").select("id, verification_status").eq("owner_user_id", user.id).maybeSingle();
  if (error) throw new Error("Could not load your store.");
  if (!vendor) redirect("/vendor/register");
  const [{ data, error: paymentError }, { data: hours, error: hoursError }] = await Promise.all([
    admin.from("vendor_payment_settings").select("aani_enabled, aani_mobile, bank_transfer_enabled, bank_name, beneficiary_name, iban, cash_enabled, card_enabled, delivery_mode, courier_name, delivery_fee_aed, destination_verification_status, destination_review_note").eq("vendor_id", vendor.id).maybeSingle(),
    admin.from("vendor_working_hours").select("day_of_week, is_open, opens_at, closes_at").eq("vendor_id", vendor.id).order("day_of_week"),
  ]);
  if (paymentError || hoursError) throw new Error("Could not load store settings. Please retry.");
  return <div className="container-pro py-8 sm:py-10" dir={ar ? "rtl" : "ltr"}><p className="eyebrow text-jade-600">{ar ? "إعداد تجربة الشراء" : "Set up your checkout"}</p><h1 className="mt-2 font-serif text-3xl sm:text-4xl">{ar ? "الدفع والتوصيل ومواعيد العمل" : "Payments, delivery & hours"}</h1><p className="mt-2 text-sm text-ink-muted">{ar ? "حدد طرق استلام المبالغ ومواعيد تأكيد الطلبات." : "Choose how you get paid and when you can confirm requests."}</p><VendorNav arabic={ar} />{vendor.verification_status === "approved" ? <BankSettingsForm arabic={ar} initial={data ?? { aani_enabled: false, aani_mobile: "", bank_transfer_enabled: false, bank_name: "", beneficiary_name: "", iban: "" }} initialHours={hours ?? []} /> : <div className="card p-6"><p className="text-sm">{ar ? "يمكنك إعداد طرق الدفع بعد اعتماد متجرك." : "You can configure payment options once your store is approved."}</p></div>}</div>;
}
