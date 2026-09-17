"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VendorOrderProgress({ reservationId }: { reservationId: string }) { const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); async function complete() { if (!window.confirm("Confirm only after the store has received the customer’s payment.")) return; setBusy(true); setError(null); const response = await fetch("/api/vendor/reservations/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, action: "confirm_payment_received" }) }); setBusy(false); if (!response.ok) { setError("Could not update this order."); return; } router.refresh(); } return <div className="mt-3 flex items-center gap-3"><button type="button" className="btn-primary px-4 py-2 text-xs" onClick={complete} disabled={busy}>{busy ? "Updating…" : "Confirm payment received"}</button>{error && <span className="text-xs text-signal-err">{error}</span>}</div>; }

