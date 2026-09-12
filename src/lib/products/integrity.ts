export interface ProductIntegrityInput {
  name: string;
  description?: string | null;
  category: string;
  karat: number;
  weight_grams: number;
  quantity: number;
  making_charge: number;
  making_charge_discount_percent: number;
  certificate_fee: number;
  certificate_number?: string | null;
  hallmark_info?: string | null;
  images?: string[] | null;
}

export interface ProductIntegrityIssue {
  code: string;
  message: string;
  field?: keyof ProductIntegrityInput;
}

const KARATS = [18, 21, 22, 24] as const;

/**
 * Catalogue integrity gate shared by vendor submission and admin approval.
 * Postgres repeats the same critical checks so a future API cannot bypass it.
 */
export function productIntegrityIssues(product: ProductIntegrityInput): ProductIntegrityIssue[] {
  const issues: ProductIntegrityIssue[] = [];
  const name = product.name.trim();
  const description = product.description?.trim() ?? "";

  if (name.length < 4) {
    issues.push({ code: "NAME_TOO_SHORT", message: "Use a specific product title.", field: "name" });
  }
  for (const mentioned of KARATS) {
    if (new RegExp(`(^|[^0-9])${mentioned}\\s*k([^0-9]|$)`, "i").test(name) && mentioned !== product.karat) {
      issues.push({
        code: "KARAT_TITLE_MISMATCH",
        message: `The title says ${mentioned}K but the structured purity is ${product.karat}K.`,
        field: "karat",
      });
    }
  }

  if (product.category === "bar" && !/\b(bar|ingot|bullion)\b/i.test(name)) {
    issues.push({ code: "CATEGORY_TITLE_MISMATCH", message: "A bar listing title must identify the item as a bar, ingot or bullion.", field: "category" });
  } else if (product.category === "coin" && !/\bcoin\b/i.test(name)) {
    issues.push({ code: "CATEGORY_TITLE_MISMATCH", message: "A coin listing title must identify the item as a coin.", field: "category" });
  } else if (product.category !== "bar" && /\b(gold bar|ingot)\b/i.test(name)) {
    issues.push({ code: "CATEGORY_TITLE_MISMATCH", message: "The title describes bullion but the selected category is not Bar.", field: "category" });
  }

  if (!Number.isFinite(product.weight_grams) || product.weight_grams <= 0) {
    issues.push({ code: "INVALID_WEIGHT", message: "Enter a positive net gold weight.", field: "weight_grams" });
  }
  if (!Number.isInteger(product.quantity) || product.quantity <= 0) {
    issues.push({ code: "NO_SELLABLE_STOCK", message: "Confirm at least one sellable unit before submission.", field: "quantity" });
  }
  if (product.making_charge_discount_percent > 0 && product.making_charge <= 0) {
    issues.push({ code: "INVALID_MAKING_DISCOUNT", message: "A making-charge discount requires an original making charge.", field: "making_charge_discount_percent" });
  }
  if (product.certificate_fee > 0 && !product.certificate_number?.trim()) {
    issues.push({ code: "CERTIFICATE_REFERENCE_REQUIRED", message: "A certificate fee requires a certificate or assay reference.", field: "certificate_number" });
  }
  if (["bar", "coin"].includes(product.category) && !product.certificate_number?.trim() && !product.hallmark_info?.trim()) {
    issues.push({ code: "BULLION_EVIDENCE_REQUIRED", message: "Bullion requires a certificate/assay reference or hallmark details.", field: "certificate_number" });
  }
  if (description.length < 20) {
    issues.push({ code: "DESCRIPTION_REQUIRED", message: "Add a description of at least 20 characters.", field: "description" });
  }
  if (!product.images?.length) {
    issues.push({ code: "PHOTO_REQUIRED", message: "Add at least one product photograph.", field: "images" });
  }
  return issues;
}

export function listingFreshCutoff(days: number): string {
  const safeDays = Number.isFinite(days) ? Math.min(180, Math.max(7, Math.trunc(days))) : 45;
  return new Date(Date.now() - safeDays * 86_400_000).toISOString();
}
