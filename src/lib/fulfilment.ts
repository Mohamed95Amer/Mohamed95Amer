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

export function isAcceptedDeliveryMapLink(value: string | null | undefined): boolean {
  const candidate = value?.trim();
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "maps.app.goo.gl" || host === "maps.apple.com" || host === "maps.google.com") return true;
    if (host === "goo.gl") return url.pathname.startsWith("/maps");
    return (host === "google.com" || host.endsWith(".google.com"))
      && (url.pathname.startsWith("/maps") || url.searchParams.has("q") || url.searchParams.has("query"));
  } catch {
    return false;
  }
}

export function coordinatesFromDeliveryMapLink(value: string): { latitude: number; longitude: number } | null {
  let candidate = value;
  try {
    candidate = decodeURIComponent(value);
  } catch {
    // Keep the original value when a partially pasted URL is not decodable yet.
  }
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
    /!3d(-?\d{1,2}(?:\.\d+)?)[^!]*!4d(-?\d{1,3}(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const match = candidate.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
    }
  }
  return null;
}

export function deliveryPinUrl(details: FulfilmentDetails): string | null {
  // Number(null) and Number("") are 0, not a real customer location.
  const toCoordinate = (value: number | string | null | undefined) =>
    value == null || (typeof value === "string" && !value.trim()) ? NaN : Number(value);
  const latitude = toCoordinate(details.delivery_latitude);
  const longitude = toCoordinate(details.delivery_longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  const candidate = details.delivery_map_link?.trim();
  return isAcceptedDeliveryMapLink(candidate) ? candidate! : null;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
