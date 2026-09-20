import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorOnboardingForm } from "./VendorOnboardingForm";

export const dynamic = "force-dynamic";

export default async function VendorRegisterPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    admin.from("vendors").select("*").eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!profile || !["customer", "vendor"].includes(profile.role)) redirect("/profile");

  return (
    <div className="container-pro py-10 sm:py-14">
      <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <aside className="lg:sticky lg:top-32">
          <p className="eyebrow text-jade-600">Partner with Get Gold</p>
          <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">Bring your store to customers across the UAE.</h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">Tell us about your business and we will help you bring your gold catalogue online. Your application is reviewed by Get Gold before products are published.</p>
          <div className="mt-7 space-y-3">
            {[["01", "Apply in a few minutes", "Share your contact and store details."], ["02", "Get reviewed", "Our team checks the business information."], ["03", "Start listing", "Add products, live prices and fulfilment options."]].map(([step, title, body]) => <div key={step} className="flex gap-3 rounded-2xl border border-jade-900/10 bg-white/70 p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jade-900 text-xs font-semibold text-white">{step}</span><div><p className="font-semibold text-jade-950">{title}</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">{body}</p></div></div>)}
          </div>
          <div className="mt-7 rounded-2xl border border-gold-300/50 bg-gold-50 p-4 text-sm leading-relaxed text-jade-950"><strong>Good to know:</strong> trade licence and Emirates ID copies are optional on this first application. You can upload them later from your private vendor dashboard.</div>
        </aside>
        <section>
      {existing?.verification_status === "approved" ? (
        <div className="card mt-6 p-6 bg-signal-ok/10 border-signal-ok/30">
          <p className="text-signal-ok font-medium">Your vendor account is approved.</p>
          <p className="text-sm text-ink-muted mt-1">You can manage products from the vendor dashboard.</p>
        </div>
      ) : existing?.verification_status === "rejected" ? (
        <div className="card mt-6 p-6 bg-signal-err/10 border-signal-err/30">
          <p className="text-signal-err font-medium">Application rejected.</p>
          {existing.admin_notes && (
            <p className="text-sm text-ink-muted mt-1">Admin notes: {existing.admin_notes}</p>
          )}
        </div>
      ) : null}
      <div className="card mt-6 p-6">
        <VendorOnboardingForm initial={existing ?? null} />
      </div>
        </section>
      </div>
    </div>
  );
}
