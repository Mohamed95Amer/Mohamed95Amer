import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/server";
import { LiveProductPrice } from "@/components/LiveProductPrice";
import { ReserveButton } from "@/components/ReserveButton";
import { ProductImage } from "@/components/ProductImage";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: { id: string } }) {
  const supabase = getServiceSupabase();
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name, description, category, karat, weight_grams, making_charge, stone_value, vendor_premium, quantity, images, certificate_number, hallmark_info, vendor_id, product_status, vendors(id, business_name, emirate, verification_status)",
    )
    .eq("id", params.id)
    .single();

  if (!product || product.product_status !== "approved") return notFound();
  const vendor = product.vendors as unknown as {
    id: string;
    business_name: string;
    emirate: string;
    verification_status: string;
  } | null;

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("platform_fee_aed, delivery_fee_aed")
    .eq("id", true)
    .single();

  return (
    <div className="container-pro grid gap-10 py-10 lg:grid-cols-5">
      <div className="lg:col-span-3 card p-6">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-bone-soft">
          <ProductImage
            category={product.category}
            karat={product.karat}
            name={product.name}
            images={product.images}
          />
        </div>
        <h1 className="mt-6 font-serif text-3xl">{product.name}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {product.category} · {product.karat}K · {product.weight_grams}g
        </p>
        {product.description && (
          <p className="mt-4 text-ink leading-relaxed">{product.description}</p>
        )}
        <div className="mt-6 grid gap-2 text-sm text-ink-muted">
          {product.certificate_number && (
            <div>Certificate: <span className="text-ink">{product.certificate_number}</span></div>
          )}
          {product.hallmark_info && (
            <div>Hallmark: <span className="text-ink">{product.hallmark_info}</span></div>
          )}
          <div>Available: <span className="text-ink">{product.quantity}</span></div>
        </div>
      </div>

      <aside className="lg:col-span-2 space-y-4">
        <div className="card p-6">
          {vendor && (
            <div className="mb-4 flex items-center justify-between">
              <Link href={`/vendors/${vendor.id}`} className="text-sm">
                <div className="font-medium text-ink">{vendor.business_name}</div>
                <div className="text-xs text-ink-muted">{vendor.emirate}</div>
              </Link>
              {vendor.verification_status === "approved" && (
                <span className="pill border-signal-ok/30 bg-signal-ok/10 text-signal-ok">Verified</span>
              )}
            </div>
          )}
          <LiveProductPrice
            karat={product.karat}
            weightGrams={Number(product.weight_grams)}
            makingCharge={Number(product.making_charge)}
            stoneValue={Number(product.stone_value)}
            vendorPremium={Number(product.vendor_premium)}
            platformFee={Number(settings?.platform_fee_aed ?? 0)}
            deliveryFee={Number(settings?.delivery_fee_aed ?? 0)}
            showBreakdown
          />
          <div className="mt-6">
            <ReserveButton productId={product.id} />
          </div>
        </div>
        <div className="card p-5 text-sm text-ink-muted">
          <p>
            <span className="text-ink font-medium">Price is recomputed server-side</span> at the moment
            you reserve. GoldHub is a marketplace — the vendor remains the seller of record.
          </p>
        </div>
      </aside>
    </div>
  );
}
