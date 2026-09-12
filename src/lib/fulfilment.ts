export const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;

export type FulfilmentMethod = "delivery" | "collection";

export interface FulfilmentDetails {
  fulfilment_method: string;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  delivery_emirate?: string | null;
  delivery_area?: string | null;
  delivery_address_line_1?: string | null;
  delivery_address_line_2?: string | null;
  delivery_landmark?: string | null;
  delivery_latitude?: number | string | null;
  delivery_longitude?: number | string | null;
  delivery_map_link?: string | null;
  customer_note?: string | null;
}

export function fulfilmentLabel(method: string): string {
  return method === "delivery" ? "Delivery" : "Store collection";
}

export function formatDeliveryAddress(details: FulfilmentDetails): string[] {
  if (details.fulfilment_method !== "delivery") return [];
  return [
    details.delivery_address_line_1,
    details.delivery_address_line_2,
    details.delivery_area,
    details.delivery_emirate,
  ].filter((part): part is string => Boolean(part?.trim()));
}

export function deliveryPinUrl(details: FulfilmentDetails): string | null {
  const latitude = Number(details.delivery_latitude);
  const longitude = Number(details.delivery_longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  const candidate = details.delivery_map_link?.trim();
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}
