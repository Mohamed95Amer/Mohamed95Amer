"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConfirmedPriceActions({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "cancel" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "accept" | "cancel") {
    if (action === "accept" && !window.confirm("Accept this final price and start the limited payment window?")) return;
    setBusy(action); setError("");
    try {
      const response = await fetch("/api/reservations/confirmed-price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, action }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? body.error ?? "Could not update this request."); return; }
      router.refresh();
    } catch { setError("Connection failed. Please retry."); } finally { setBusy(null); }
  }

  return <div className="mt-5 flex flex-wrap items-center gap-3">
    <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => act("accept")}>{busy === "accept" ? "Accepting…" : "Accept price & continue"}</button>
    <button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => act("cancel")}>{busy === "cancel" ? "Cancelling…" : "Cancel request"}</button>
    {error && <p role="alert" className="w-full text-sm text-signal-err">{error}</p>}
  </div>;
}

