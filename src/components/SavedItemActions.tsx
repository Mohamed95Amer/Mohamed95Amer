"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SavedItemActions({ productId, hasAlert }: { productId: string; hasAlert: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function removeSaved() { setBusy(true); await fetch("/api/account/favourites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, favourite: false }) }); router.refresh(); }
  async function removeAlert() { setBusy(true); await fetch("/api/account/price-alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) }); router.refresh(); }
  return <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="text-xs font-semibold text-jade-700 underline underline-offset-4" onClick={removeSaved} disabled={busy}>Remove saved item</button>{hasAlert && <button type="button" className="text-xs font-semibold text-gold-600 underline underline-offset-4" onClick={removeAlert} disabled={busy}>Turn off alert</button>}</div>;
}

