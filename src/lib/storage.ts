/**
 * Public URLs for files in the `product-images` bucket.
 *
 * products.images holds storage *paths* (e.g. "<vendor_id>/bangle-01.jpg"),
 * not URLs, so a path has to be expanded before it can be used as an image
 * src. Anything that already looks absolute is passed through untouched, which
 * keeps externally-hosted images working if a vendor ever supplies one.
 */
export const PRODUCT_IMAGE_BUCKET = "product-images";

export function publicStorageUrl(path: string, bucket = PRODUCT_IMAGE_BUCKET): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  const clean = trimmed.replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${clean
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
