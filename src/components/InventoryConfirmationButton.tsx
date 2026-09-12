"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InventoryConfirmationButton({ productId }: { productId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/vendor/inventory-confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: productId ?? null }) });
    const json = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setMessage(json.error ?? "Could not confirm stock"); return; }
    setMessage(`${json.confirmed} ${json.confirmed === 1 ? "listing" : "listings"} refreshed.`); router.refresh();
  }
  return <div className="flex items-center gap-2"><button className="btn-ghost px-4 py-2 text-xs" onClick={confirm} disabled={busy}>{busy ? "Refreshing…" : productId ? "Confirm in stock" : "Confirm all live stock"}</button>{message && <span className="text-xs text-ink-muted" role="status">{message}</span>}</div>;
}
