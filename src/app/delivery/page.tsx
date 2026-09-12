import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery dashboard", robots: { index: false, follow: false } };

export default async function DeliveryDashboardPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const [{ data: profile }, { data: company }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("delivery_companies").select("*").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!company) {
    if (profile && !["customer", "delivery_company"].includes(profile.role)) redirect("/profile");
    redirect("/delivery/register");
  }

  const approved = company.verification_status === "approved";
  return (
    <div className="container-pro py-10 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow text-jade-600">Delivery operations</p><h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">{company.company_name}</h1><p className="mt-2 text-sm text-ink-muted">Serving {company.emirates_served.join(", ")}</p></div>
        <span className={`pill ${approved ? "border-signal-ok/30 bg-signal-ok/10 text-signal-ok" : "border-gold-400/30 bg-gold-50 text-gold-600"}`}>{statusLabel(company.verification_status)}</span>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <section className="card p-6 md:col-span-2">
          <h2 className="font-serif text-2xl font-semibold text-jade-950">Company profile</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="label">Primary contact</dt><dd className="mt-1">{company.contact_name}</dd></div>
            <div><dt className="label">Operations email</dt><dd className="mt-1 break-all">{company.email}</dd></div>
            <div><dt className="label">Operations phone</dt><dd className="mt-1">{company.phone}</dd></div>
            <div><dt className="label">Trade licence</dt><dd className="mt-1">{company.trade_license_number}</dd></div>
          </dl>
          <Link href="/delivery/register" className="btn-ghost mt-6">Edit company profile</Link>
        </section>
        <section className="card bg-jade-950 p-6 text-white">
          <p className="eyebrow text-gold-200">Delivery assignments</p>
          <p className="mt-4 font-serif text-4xl font-semibold">0</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">Assignments will appear after Get Gold activates courier allocation and a vendor selects your approved company.</p>
        </section>
      </div>

      {!approved && <div className="mt-6 rounded-2xl border border-gold-400/30 bg-gold-50 p-5 text-sm text-gold-700">Your profile is {statusLabel(company.verification_status).toLowerCase()}. No customer or order data is shared until approval and assignment.</div>}
    </div>
  );
}
