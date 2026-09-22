import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductForm } from "@/components/ProductForm";
import { cookies } from "next/headers";
import { VendorNav } from "@/components/VendorNav";
import { statusLabel } from "@/lib/presentation";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, verification_status")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  const { data: product } = await admin
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (!product || product.vendor_id !== vendor.id) return notFound();

  return (
    <div className="container-pro py-8 sm:py-10">
      <h1 className="font-serif text-3xl">{arabic ? "تعديل المنتج" : "Edit product"}</h1>
      <p className="text-sm text-ink-muted mt-1">Status: <span className="font-medium">{statusLabel(product.product_status)}</span></p>
      <VendorNav arabic={arabic} />
      <div className="mt-6">
        <ProductForm initial={product} vendorId={vendor.id} arabic={arabic} canSubmit={vendor.verification_status === "approved"} />
      </div>
    </div>
  );
}
