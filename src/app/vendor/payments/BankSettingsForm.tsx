"use client";
import { useState, type FormEvent } from "react";

export function BankSettingsForm({ initial }: { initial: { bank_transfer_enabled: boolean; bank_name: string; beneficiary_name: string; iban: string; cash_enabled?: boolean; card_enabled?: boolean; delivery_mode?: string; courier_name?: string; delivery_fee_aed?: number | null } }) {
  const [values, setValues] = useState({ cash_enabled: true, card_enabled: false, delivery_mode: "own_staff", courier_name: "", delivery_fee_aed: null as number | null, ...initial });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/vendor/payment-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json(); setMessage(response.ok ? "Saved. Existing orders retain their original bank details." : body.error);
    } catch { setMessage("Connection failed. Please retry."); } finally { setBusy(false); }
  }
  return <form className="card mt-6 max-w-xl space-y-5 p-6" onSubmit={save}>
    <h2 className="font-serif text-2xl">Payment and delivery options</h2>
    <label className="flex gap-3"><input type="checkbox" checked={values.cash_enabled} onChange={event => setValues({ ...values, cash_enabled: event.target.checked })} />Cash at delivery or collection</label>
    <label className="flex gap-3"><input type="checkbox" checked={values.card_enabled} onChange={event => setValues({ ...values, card_enabled: event.target.checked })} />Card at delivery or collection (our terminal is available)</label>
    <label className="block"><span className="label">Delivery arranged by the vendor</span><select className="input" value={values.delivery_mode} onChange={event => setValues({ ...values, delivery_mode: event.target.value })}><option value="own_staff">Our own staff</option><option value="external_courier">Our appointed third-party courier</option></select></label>
    {values.delivery_mode === "external_courier" && <label className="block"><span className="label">Courier name</span><input className="input" required value={values.courier_name} onChange={event => setValues({ ...values, courier_name: event.target.value })} /></label>}
    <label className="block"><span className="label">Delivery fee once per order (AED; maximum 60)</span><input className="input" type="number" min="0" max="60" step="0.01" value={values.delivery_fee_aed ?? ""} onChange={event => setValues({ ...values, delivery_fee_aed: event.target.value === "" ? null : Number(event.target.value) })} /><span className="text-xs text-ink-muted">Blank uses the platform estimate. Pickup is always free. Arrange insured delivery and any cash collection directly with your courier.</span></label>
    <label className="flex gap-3"><input type="checkbox" checked={values.bank_transfer_enabled} onChange={event => setValues({ ...values, bank_transfer_enabled: event.target.checked })} />Accept bank transfers directly to this store</label>
    {([['bank_name','Bank name'],['beneficiary_name','Beneficiary legal name'],['iban','UAE IBAN']] as const).map(([key,label]) => <label key={key} className="block"><span className="label">{label}</span><input className="input mt-1" value={values[key]} required={values.bank_transfer_enabled} maxLength={key === 'iban' ? 40 : 120} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}
    <p className="text-sm text-ink-muted">Use only this business’s bank account. Customers pay you, not Get Gold. Verify cleared funds in your bank before confirming payment; an uploaded receipt is not proof of settlement.</p>
    <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save payment settings"}</button><p role="status" className="text-sm">{message}</p>
  </form>;
}
