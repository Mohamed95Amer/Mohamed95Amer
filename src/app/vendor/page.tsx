import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getCurrentProfile } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorNav } from "@/components/VendorNav";
import { statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function VendorDashboardPage() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!vendor) redirect("/vendor/register");

  const [{ count: productCount }, { count: pendingOrders }] = await Promise.all([
    admin.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", vendor.id),
    admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendor.id)
      .eq("status", "pending_vendor_confirmation"),
  ]);

  return (
    <div className="container-pro py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">{vendor.business_name}</h1>
          <p className="text-sm text-ink-muted">{vendor.emirate} · {profile?.email}</p>
        </div>
        <span
          className={`pill ${
            vendor.verification_status === "approved"
              ? "border-signal-ok/30 bg-signal-ok/10 text-signal-ok"
              : vendor.verification_status === "rejected" || vendor.verification_status === "suspended"
              ? "border-signal-err/30 bg-signal-err/10 text-signal-err"
              : "border-signal-warn/30 bg-signal-warn/10 text-signal-warn"
          }`}
        >
          {statusLabel(vendor.verification_status)}
        </span>
      </div>
      <VendorNav />

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/vendor/products" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Products</div>
          <div className="mt-2 font-serif text-3xl">{productCount ?? 0}</div>
          <div className="mt-2 text-sm text-ink-muted">Manage your listings →</div>
        </Link>
        <Link href="/vendor/orders" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Pending orders</div>
          <div className="mt-2 font-serif text-3xl">{pendingOrders ?? 0}</div>
          <div className="mt-2 text-sm text-ink-muted">Confirm or reject →</div>
        </Link>
        <Link href="/vendor/documents" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Documents</div>
          <div className="mt-2 font-serif text-3xl">Upload</div>
          <div className="mt-2 text-sm text-ink-muted">Trade license, IDs, photos →</div>
        </Link>
        <Link href="/vendor/reviews" className="card p-6 hover:border-gold-300">
          <div className="text-xs uppercase tracking-wide text-ink-muted">Reputation</div>
          <div className="mt-2 font-serif text-3xl">Reviews</div>
          <div className="mt-2 text-sm text-ink-muted">Read and respond →</div>
        </Link>
      </div>

      {vendor.verification_status !== "approved" && (
        <div className="card mt-8 p-6 bg-signal-warn/10 border-signal-warn/30">
          <p className="font-medium text-signal-warn">
            Your account is {statusLabel(vendor.verification_status).toLowerCase()}. You can prepare drafts, but you cannot publish products until admin approval.
          </p>
        </div>
      )}
    </div>
  );
}
