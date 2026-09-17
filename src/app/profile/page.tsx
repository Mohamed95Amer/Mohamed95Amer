import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/ProfileForm";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentProfile, requireUser, type AccountRole } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { formatDubaiDateTime, statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My profile", robots: { index: false, follow: false } };

const roleDetails: Record<AccountRole, { label: string; description: string; href: string; action: string }> = {
  customer: { label: "Customer", description: "Browse verified listings, reserve at a locked price and track purchase insights.", href: "/account", action: "View purchase history" },
  vendor: { label: "Vendor", description: "Manage your verified store, inventory, orders and buyer reputation.", href: "/vendor", action: "Open vendor dashboard" },
  delivery_company: { label: "Delivery company", description: "Maintain your verified logistics business profile and operational access.", href: "/delivery", action: "Open delivery dashboard" },
  admin: { label: "Platform administrator", description: "Review businesses, listings, orders, price operations and marketplace settings.", href: "/admin", action: "Open administration" },
  super_admin: { label: "Platform owner", description: "Full Get Gold operations and governance access.", href: "/admin", action: "Open administration" },
};

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const role = profile.role as AccountRole;
  const details = roleDetails[role] ?? roleDetails.customer;
  const admin = getServiceSupabase();
  const business = role === "vendor"
    ? (await admin.from("vendors").select("business_name, verification_status").eq("owner_user_id", user.id).maybeSingle()).data
    : role === "delivery_company"
      ? (await admin.from("delivery_companies").select("company_name, verification_status").eq("owner_user_id", user.id).maybeSingle()).data
      : null;

  return (
    <div className="container-pro py-10 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-jade-600">Your Get Gold identity</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">Profile & access</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">Your personal information is separate from any verified business profile. Your platform role can only be changed through an approved onboarding or trusted admin process.</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="card p-6 sm:p-8">
          <p className="eyebrow text-jade-600">Personal profile</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-jade-950">Contact details</h2>
          <p className="mt-2 text-sm text-ink-muted">Signed in as <span className="font-semibold text-jade-950">{profile.email}</span></p>
          <div className="mt-6"><ProfileForm fullName={profile.full_name ?? ""} phone={profile.phone ?? ""} /></div>
        </section>

        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="bg-jade-950 p-6 text-white">
              <p className="eyebrow text-gold-200">Account type</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">{details.label}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{details.description}</p>
            </div>
            <div className="p-6">
              {business && (
                <div className="mb-5 rounded-2xl bg-jade-50 p-4">
                  <p className="font-semibold text-jade-950">{"business_name" in business ? business.business_name : business.company_name}</p>
                  <p className="mt-1 text-xs text-ink-muted">Business status: {statusLabel(business.verification_status)}</p>
                </div>
              )}
              <Link href={details.href} className="btn-primary w-full">{details.action}</Link>
            </div>
          </section>
          <section className="card p-6 text-sm">
            <h2 className="font-serif text-xl font-semibold text-jade-950">Account security</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-ink-muted">Email</dt><dd className="text-right break-all">{profile.email}</dd>
              <dt className="text-ink-muted">Created</dt><dd className="text-right">{formatDubaiDateTime(user.created_at)}</dd>
              <dt className="text-ink-muted">Role</dt><dd className="text-right">{details.label}</dd>
            </dl>
            <Link href="/forgot-password" className="mt-5 inline-flex font-semibold text-jade-700 underline underline-offset-4">Reset password</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
