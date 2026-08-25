import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getServiceSupabase } from "@/lib/supabase/server";
import { LiveProductPrice } from "@/components/LiveProductPrice";
import { ReserveButton } from "@/components/ReserveButton";
import { ProductImage } from "@/components/ProductImage";

export const dynamic = "force-dynamic";

const SELECT =
  "id, name, description, category, karat, weight_grams, making_charge, stone_value, vendor_premium, quantity, images, certificate_number, hallmark_info, vendor_id, product_status, vendors(id, business_name, emirate, verification_status)";

type Vendor = {
  id: string;
  business_name: string;
  emirate: string;
  verification_status: string;
} | null;

async function loadProduct(id: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("products").select(SELECT).eq("id", id).single();
  return data;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await loadProduct(params.id);
  if (!product || product.product_status !== "approved") return { title: "Not found — GoldHub" };
  const vendor = product.vendors as unknown as Vendor;
  return {
    title: `${product.name} — ${product.karat}K, ${product.weight_grams}g | GoldHub`,
    description:
      product.description ??
      `${product.karat}K ${product.category}, ${product.weight_grams}g${
        vendor ? `, from ${vendor.business_name}` : ""
      }. Priced live against the UAE gold market.`,
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const supabase = getServiceSupabase();
  const product = await loadProduct(params.id);
  if (!product || product.product_status !== "approved") return notFound();

  const vendor = product.vendors as unknown as Vendor;

  const [{ data: settings }, { data: availability }] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("platform_fee_aed, delivery_fee_aed")
      .eq("id", true)
      .single(),
    // Stock net of unexpired holds. product.quantity alone would advertise
    // units that other customers are already holding.
    supabase.rpc("available_quantity", { p_product_id: product.id }),
  ]);

  const available =
    typeof availability === "number" ? availability : Number(product.quantity ?? 0);
  const soldOut = available <= 0;

  const specs: Array<[string, string]> = [
    ["Category", String(product.category)],
    ["Purity", `${product.karat}K`],
    ["Weight", `${product.weight_grams} g`],
  ];
  if (product.hallmark_info) specs.push(["Hallmark", product.hallmark_info]);
  if (product.certificate_number) specs.push(["Certificate", product.certificate_number]);

  return (
    <div className="container-pro py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <Link href="/" className="hover:text-ink">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/marketplace" className="hover:text-ink">Marketplace</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/marketplace?category=${product.category}`} className="capitalize hover:text-ink">
          {product.category}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-bone-deep bg-bone-soft">
            <ProductImage
              category={product.category}
              karat={product.karat}
              name={product.name}
              images={product.images}
            />
            <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-bone backdrop-blur">
              {product.karat}K
            </span>
            {soldOut && (
              <span className="absolute right-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold text-bone backdrop-blur">
                Sold out
              </span>
            )}
          </div>

          <h1 className="mt-6 font-serif text-3xl leading-tight">{product.name}</h1>
          {product.description && (
            <p className="mt-3 max-w-prose leading-relaxed text-ink">{product.description}</p>
          )}

          <h2 className="mt-8 font-serif text-xl">Specification</h2>
          <dl className="mt-3 overflow-hidden rounded-lg border border-bone-deep">
            {specs.map(([k, v], i) => (
              <div
                key={k}
                className={`flex justify-between gap-4 px-4 py-2.5 text-sm ${
                  i % 2 ? "bg-bone-soft" : "bg-transparent"
                }`}
              >
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-right font-medium capitalize">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="space-y-4 lg:col-span-2">
          <div className="card p-6">
            {vendor && (
              <div className="mb-5 flex items-start justify-between gap-3 border-b border-bone-deep pb-4">
                <Link href={`/vendors/${vendor.id}`} className="group text-sm">
                  <div className="font-medium text-ink group-hover:underline">{vendor.business_name}</div>
                  <div className="text-xs text-ink-muted">{vendor.emirate}</div>
                </Link>
                {vendor.verification_status === "approved" && (
                  <span className="pill shrink-0 border-signal-ok/30 bg-signal-ok/10 text-signal-ok">
                    Verified
                  </span>
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

            <p className="mt-4 text-xs text-ink-muted">
              {soldOut ? (
                <span className="font-medium text-signal-warn">
                  Every unit is currently reserved.
                </span>
              ) : (
                <>
                  <span className="font-medium text-signal-ok">{available}</span>{" "}
                  {available === 1 ? "unit" : "units"} available
                </>
              )}
            </p>

            <div className="mt-5">
              <ReserveButton productId={product.id} soldOut={soldOut} />
            </div>
          </div>

          <div className="card p-5 text-sm text-ink-muted">
            <p>
              <span className="font-medium text-ink">The price is recomputed server-side</span> the
              moment you reserve, so what you pay matches the market at that instant — not what was
              on screen. GoldHub is a marketplace; the vendor remains the seller of record.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
