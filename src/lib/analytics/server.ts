import { getServiceSupabase } from "@/lib/supabase/server";

export type MarketplaceEventName =
  | "marketplace_view"
  | "search"
  | "product_view"
  | "favourite_added"
  | "compare_added"
  | "alert_created"
  | "identity_started"
  | "reservation_created"
  | "offer_accepted"
  | "delivery_assigned"
  | "referral_shared"
  | "buyer_request_created"
  | "store_visit_requested";

export async function trackServerEvent(input: {
  eventName: MarketplaceEventName;
  userId?: string | null;
  anonymousSessionId?: string | null;
  productId?: string | null;
  vendorId?: string | null;
  reservationId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const { error } = await getServiceSupabase().from("marketplace_events").insert({
    event_name: input.eventName,
    user_id: input.userId ?? null,
    anonymous_session_id: input.anonymousSessionId ?? null,
    product_id: input.productId ?? null,
    vendor_id: input.vendorId ?? null,
    reservation_id: input.reservationId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("marketplace_event_write_failed", error.message);
}
