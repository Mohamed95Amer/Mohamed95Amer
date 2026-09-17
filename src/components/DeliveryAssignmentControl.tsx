"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Company { id: string; company_name: string; emirates_served: string[]; }
interface Assignment { id: string; status: string; tracking_code: string; delivery_company_id: string; company?: { company_name: string } | null; }

export function DeliveryAssignmentControl({ reservationId, emirate, companies, assignment }: { reservationId: string; emirate?: string | null; companies: Company[]; assignment?: Assignment | null }) {
  const router = useRouter(); const eligible = companies.filter((company) => !emirate || company.emirates_served.includes(emirate)); const [companyId, setCompanyId] = useState(assignment?.delivery_company_id ?? eligible[0]?.id ?? ""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function assign() { setBusy(true); setError(null); const response = await fetch("/api/vendor/delivery-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId, deliveryCompanyId: companyId, publicNote: note || null }) }); setBusy(false); if (!response.ok) { const json = await response.json().catch(() => ({})); setError(json.error ?? "Could not assign delivery"); return; } router.refresh(); }
  if (assignment && !["declined", "cancelled"].includes(assignment.status)) return <div className="rounded-xl border border-jade-900/10 bg-white p-3 text-xs"><p className="font-semibold text-jade-950">Courier: {assignment.company?.company_name ?? "Assigned partner"}</p><p className="mt-1 text-ink-muted">{assignment.tracking_code} · {assignment.status.replaceAll("_", " ")}</p></div>;
  if (eligible.length === 0) return <p className="text-xs text-signal-warn">No approved delivery partner covers {emirate ?? "this address"} yet.</p>;
  return <div className="grid gap-2 rounded-xl border border-jade-900/10 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div><label className="label" htmlFor={`courier-${reservationId}`}>Delivery partner</label><select id={`courier-${reservationId}`} className="input py-2 text-xs" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{eligible.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select></div><div><label className="label" htmlFor={`courier-note-${reservationId}`}>Pickup note</label><input id={`courier-note-${reservationId}`} className="input py-2 text-xs" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional customer-safe note" /></div><button type="button" className="btn-primary px-4 py-2 text-xs" onClick={assign} disabled={busy || !companyId}>{busy ? "Assigning…" : "Assign"}</button>{error && <p role="alert" className="text-xs text-signal-err sm:col-span-3">{error}</p>}</div>;
}

