"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; title: string; service_fee_discount_percent: number; delivery_discount_percent: number; starts_at: string; ends_at: string; cancelled_at: string | null };
type Banner = { id: string; title: string; placement: string; image_path: string | null; starts_at: string; ends_at: string; cancelled_at: string | null };

export function AdminMarketingControls({ campaigns, banners }: { campaigns: Campaign[]; banners: Banner[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createCampaign(formData: FormData) {
    setBusy(true); setMessage(null);
    const startsAt = String(formData.get("startsAt") ?? "");
    const response = await fetch("/api/admin/marketplace-promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: formData.get("title"), serviceFeeDiscountPercent: Number(formData.get("serviceFeeDiscountPercent")), deliveryDiscountPercent: Number(formData.get("deliveryDiscountPercent")), durationDays: Number(formData.get("durationDays")), startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    }) });
    await finish(response);
  }

  async function createBanner(formData: FormData) {
    setBusy(true); setMessage(null);
    const startsAt = String(formData.get("startsAt") ?? "");
    if (startsAt) formData.set("startsAt", new Date(startsAt).toISOString());
    const response = await fetch("/api/admin/banners", { method: "POST", body: formData });
    await finish(response);
  }

  async function cancel(endpoint: string, id: string) {
    setBusy(true); setMessage(null);
    const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await finish(response);
  }

  async function finish(response: Response) {
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setMessage(typeof body.error === "string" ? body.error : "Could not save this change"); return; }
    setMessage("Saved and recorded in the audit log."); router.refresh();
  }

  return <div className="grid gap-6">
    <section className="card p-6">
      <p className="eyebrow text-jade-600">Pricing campaign</p><h2 className="mt-1 font-serif text-2xl">Seasonal fee and delivery discounts</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">A Get Gold fee discount is applied after the customer’s first-three-orders offer. Delivery discounts apply once per delivery order and are treated as a Get Gold-funded credit to the vendor. Checkout snapshots the campaign and exact settlement amounts.</p>
      <form action={createCampaign} className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2"><label className="label" htmlFor="campaign-title">Campaign name</label><input id="campaign-title" className="input" name="title" required maxLength={100} placeholder="Eid delivery offer" /></div>
        <div><label className="label" htmlFor="fee-discount">Get Gold fee discount</label><div className="relative"><input id="fee-discount" className="input pr-8" name="serviceFeeDiscountPercent" type="number" min={0} max={100} defaultValue={0} required /><span className="absolute right-3 top-3 text-sm text-ink-muted">%</span></div></div>
        <div><label className="label" htmlFor="delivery-discount">Delivery discount</label><div className="relative"><input id="delivery-discount" className="input pr-8" name="deliveryDiscountPercent" type="number" min={0} max={100} defaultValue={100} required /><span className="absolute right-3 top-3 text-sm text-ink-muted">%</span></div></div>
        <div><label className="label" htmlFor="campaign-days">Duration</label><div className="relative"><input id="campaign-days" className="input pr-12" name="durationDays" type="number" min={1} max={90} defaultValue={7} required /><span className="absolute right-3 top-3 text-xs text-ink-muted">days</span></div></div>
        <div><label className="label" htmlFor="campaign-start">Starts (optional)</label><input id="campaign-start" className="input" name="startsAt" type="datetime-local" /></div>
        <div className="md:col-span-2 flex items-end"><button className="btn-primary" disabled={busy}>Schedule campaign</button></div>
      </form>
      <HistoryTable rows={campaigns.map((item) => ({ ...item, name: item.title, details: `${item.service_fee_discount_percent}% fee · ${item.delivery_discount_percent}% delivery` }))} onCancel={(id) => cancel("/api/admin/marketplace-promotions", id)} busy={busy} />
    </section>

    <section className="card p-6">
      <p className="eyebrow text-jade-600">Creative control</p><h2 className="mt-1 font-serif text-2xl">Marketplace ad banners</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">Upload promotional artwork or publish a text-only banner. JPG, PNG and WebP files are stored in Get Gold’s public marketing bucket.</p>
      <form action={createBanner} className="mt-5 grid gap-4 md:grid-cols-2">
        <div><label className="label" htmlFor="banner-title">Headline</label><input id="banner-title" className="input" name="title" required maxLength={100} /></div>
        <div><label className="label" htmlFor="banner-placement">Placement</label><select id="banner-placement" className="input" name="placement" defaultValue="home_top"><option value="home_top">Homepage · top</option><option value="home_middle">Homepage · middle</option><option value="marketplace_top">Marketplace · top</option><option value="vendors_top">Vendor directory · top</option></select></div>
        <div className="md:col-span-2"><label className="label" htmlFor="banner-body">Supporting text</label><textarea id="banner-body" className="input min-h-20" name="body" maxLength={280} /></div>
        <div><label className="label" htmlFor="banner-image">Banner artwork (optional)</label><input id="banner-image" className="input file:mr-3 file:border-0 file:bg-transparent file:font-semibold" name="image" type="file" accept="image/jpeg,image/png,image/webp" /></div>
        <div><label className="label" htmlFor="banner-alt">Image description</label><input id="banner-alt" className="input" name="imageAlt" maxLength={160} placeholder="Required when artwork is uploaded" /></div>
        <div><label className="label" htmlFor="banner-cta">Button text (optional)</label><input id="banner-cta" className="input" name="ctaLabel" maxLength={40} placeholder="Shop the offer" /></div>
        <div><label className="label" htmlFor="banner-href">Button link</label><input id="banner-href" className="input" name="ctaHref" maxLength={500} placeholder="/marketplace or https://…" /></div>
        <div><label className="label" htmlFor="banner-days">Duration (days)</label><input id="banner-days" className="input" name="durationDays" type="number" min={1} max={90} defaultValue={7} required /></div>
        <div><label className="label" htmlFor="banner-order">Display priority</label><input id="banner-order" className="input" name="displayOrder" type="number" min={0} max={100} defaultValue={0} required /><p className="mt-1 text-xs text-ink-muted">Lower numbers appear first.</p></div>
        <div><label className="label" htmlFor="banner-start">Starts (optional)</label><input id="banner-start" className="input" name="startsAt" type="datetime-local" /></div>
        <div className="flex items-end"><button className="btn-primary" disabled={busy}>Schedule banner</button></div>
      </form>
      <HistoryTable rows={banners.map((item) => ({ ...item, name: item.title, details: item.placement.replaceAll("_", " ") }))} onCancel={(id) => cancel("/api/admin/banners", id)} busy={busy} />
    </section>
    {message && <p role="status" className={`text-sm ${message.startsWith("Saved") ? "text-signal-ok" : "text-signal-err"}`}>{message}</p>}
  </div>;
}

function HistoryTable({ rows, onCancel, busy }: { rows: Array<{ id: string; name: string; details: string; starts_at: string; ends_at: string; cancelled_at: string | null }>; onCancel: (id: string) => void; busy: boolean }) {
  const now = Date.now();
  return <div className="mt-6 overflow-x-auto rounded-xl border border-jade-900/10"><table className="min-w-[620px] w-full text-sm"><thead className="bg-bone-soft text-ink-muted"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Offer</th><th className="px-3 py-2 text-left">Dates</th><th className="px-3 py-2 text-left">Status</th><th /></tr></thead><tbody>{rows.map((item) => { const active = !item.cancelled_at && Date.parse(item.starts_at) <= now && Date.parse(item.ends_at) > now; const upcoming = !item.cancelled_at && Date.parse(item.starts_at) > now; return <tr key={item.id} className="border-t border-bone-deep"><td className="px-3 py-2 font-medium">{item.name}</td><td className="px-3 py-2 capitalize">{item.details}</td><td className="px-3 py-2 text-xs">{date(item.starts_at)} → {date(item.ends_at)}</td><td className="px-3 py-2">{item.cancelled_at ? "Cancelled" : active ? "Active" : upcoming ? "Scheduled" : "Ended"}</td><td className="px-3 py-2 text-right">{(active || upcoming) && <button type="button" className="text-xs font-semibold text-signal-err underline" disabled={busy} onClick={() => onCancel(item.id)}>Cancel</button>}</td></tr>; })}{rows.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-ink-muted">Nothing published yet.</td></tr>}</tbody></table></div>;
}

function date(value: string) { return new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
