"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VendorOrderActions({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: "confirm" | "reject") {
    setBusy(decision);
    setErr(null);
    const res = await fetch("/api/vendor/reservations/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, decision }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      <button className="btn-ghost text-xs" disabled={busy !== null} onClick={() => act("reject")}>
        {busy === "reject" ? "…" : "Reject"}
      </button>
      <button className="btn-primary text-xs" disabled={busy !== null} onClick={() => act("confirm")}>
        {busy === "confirm" ? "…" : "Confirm"}
      </button>
      {err && <span className="text-xs text-signal-err ml-2">{err}</span>}
    </div>
  );
}
