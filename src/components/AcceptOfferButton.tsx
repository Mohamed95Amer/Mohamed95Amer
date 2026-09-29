"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptOfferButton({ offerId, arabic = false }: { offerId: string; arabic?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    setBusy(true); setError(null);
    const response = await fetch("/api/buyer-requests/accept-offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId }) });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(arabic ? "تعذر قبول العرض. حاول مجدداً." : json.error ?? "Could not accept offer"); return; }
    router.refresh();
  }
  return <div><button className="btn-primary px-4 py-2 text-xs" onClick={accept} disabled={busy}>{busy ? arabic ? "جارٍ القبول…" : "Accepting…" : arabic ? "قبول هذا العرض" : "Accept this offer"}</button>{error && <p role="alert" className="mt-1 text-xs text-signal-err">{error}</p>}</div>;
}
