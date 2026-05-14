"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/gold-price/refresh", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Failed");
      return;
    }
    const j = await res.json();
    setMsg(`Refreshed via ${j.tick?.source}: ${j.tick?.price_per_gram_24k_aed ?? "—"} AED/g`);
    router.refresh();
  }

  return (
    <div>
      <button className="btn-primary" onClick={onClick} disabled={busy}>
        {busy ? "Refreshing…" : "Manually refresh"}
      </button>
      {msg && <p className="text-xs text-signal-ok mt-2">{msg}</p>}
      {err && <p className="text-xs text-signal-err mt-2">{err}</p>}
    </div>
  );
}
