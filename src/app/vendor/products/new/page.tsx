import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductForm } from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  return (
    <div className="container-pro py-10 max-w-3xl">
      <h1 className="font-serif text-3xl">Add product</h1>
      <p className="text-sm text-ink-muted mt-1">Save as draft, then submit for admin approval.</p>
      <div className="card mt-6 p-6">
        <ProductForm vendorId={vendor.id} />
      </div>
    </div>
  );
}
