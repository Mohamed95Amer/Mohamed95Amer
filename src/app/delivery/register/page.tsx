import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { DeliveryCompanyForm } from "./DeliveryCompanyForm";
import { statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery company onboarding", robots: { index: false, follow: false } };

export default async function DeliveryRegisterPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("delivery_companies").select("*").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!profile || !["customer", "delivery_company"].includes(profile.role)) redirect("/profile");

  return (
    <div className="container-pro max-w-4xl py-10 sm:py-14">
      <p className="eyebrow text-jade-600">Logistics partner onboarding</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">Create your delivery company profile</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">Submit the licensed business and service-area details Get Gold needs to review before assigning any jewellery deliveries.</p>
      {existing && <div className="mt-6 rounded-2xl border border-jade-900/10 bg-jade-50 p-4 text-sm"><span className="font-semibold text-jade-950">Current status:</span> {statusLabel(existing.verification_status)}. Editing and resubmitting sends the profile back for review.</div>}
      <div className="card mt-6 p-6 sm:p-8"><DeliveryCompanyForm initial={existing ?? null} /></div>
    </div>
  );
}
