import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ProductForm } from "@/components/ProductForm";
import { cookies } from "next/headers";
import { VendorNav } from "@/components/VendorNav";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await requireUser();
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const admin = getServiceSupabase();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, verification_status")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vendor) redirect("/vendor/register");

  return (
    <div className="container-pro py-8 sm:py-10">
      <h1 className="font-serif text-3xl">{arabic ? "إضافة منتج" : "Add a product"}</h1>
      <p className="text-sm text-ink-muted mt-1">{vendor.verification_status === "approved" ? (arabic ? "أضف تفاصيل المنتج وصوره ورسومه؛ تُنشر المنتجات المستوفية للمتطلبات مباشرةً." : "Add the product details, photos and charges. Listings that pass the checks publish immediately.") : (arabic ? "أضف تفاصيل المنتج واحفظه كمسودة. ستتمكن من النشر بعد اعتماد المتجر." : "Add product details and save a draft. You can publish once your store is approved.")}</p>
      <VendorNav arabic={arabic} />
      <div className="mt-6">
        <ProductForm vendorId={vendor.id} arabic={arabic} canSubmit={vendor.verification_status === "approved"} />
      </div>
    </div>
  );
}
