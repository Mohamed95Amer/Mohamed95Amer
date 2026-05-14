import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VendorOnboardingForm } from "./VendorOnboardingForm";

export const dynamic = "force-dynamic";

export default async function VendorRegisterPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: existing } = await admin
    .from("vendors")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return (
    <div className="container-pro py-10 max-w-3xl">
      <h1 className="font-serif text-3xl">List your gold shop on GoldHub</h1>
      <p className="text-sm text-ink-muted mt-1">
        Submit your trade license and store details. Our compliance team reviews each application before you can publish products.
      </p>
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
    </div>
  );
}
