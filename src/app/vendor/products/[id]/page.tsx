import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductForm } from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const { data: product } = await admin
    .from("products")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!product || product.vendor_id !== vendor.id) return notFound();

  return (
    <div className="container-pro py-10 max-w-3xl">
      <h1 className="font-serif text-3xl">Edit product</h1>
      <p className="text-sm text-ink-muted mt-1">Status: <span className="font-medium">{product.product_status}</span></p>
      <div className="card mt-6 p-6">
        <ProductForm initial={product} vendorId={vendor.id} />
      </div>
    </div>
  );
}
