"use client";

import { useEffect } from "react";

export function TrackPageView({ eventName, productId, vendorId, metadata = {} }: { eventName: "marketplace_view" | "search" | "product_view"; productId?: string; vendorId?: string; metadata?: Record<string, string | number | boolean | null> }) {
  useEffect(() => {
    let session = localStorage.getItem("gg_session"); if (!session) { session = crypto.randomUUID(); localStorage.setItem("gg_session", session); }
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventName, anonymousSessionId: session, productId, vendorId, metadata }) });
  }, [eventName, productId, vendorId, metadata]);
  return null;
}
