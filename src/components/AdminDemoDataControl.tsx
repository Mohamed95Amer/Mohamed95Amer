"use client";

import { useState } from "react";

export function AdminDemoDataControl({ initialVisible }: { initialVisible: boolean }) {
  const [visible, setVisible] = useState(initialVisible);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    const next = !visible;
    const response = await fetch("/api/admin/demo-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo_data_visible: next }),
    });
    if (response.ok) {
      setVisible(next);
      setMessage(next ? "Demo data is visible on the public site." : "Demo data is hidden from the public site.");
    } else {
      const body = await response.json().catch(() => null);
      setMessage(typeof body?.error === "string" ? body.error : "Could not update demo-data visibility.");
    }
    setBusy(false);
  }

  return (
    <section className="card border-gold-300/60 bg-gold-50/40 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-gold-700">Launch control</p>
          <h2 className="mt-1 font-serif text-xl text-jade-950">Demo catalogue visibility</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            {visible ? "Seeded demo stores and listings are currently visible to public visitors." : "Seeded demo stores, listings, orders and review are hidden from public visitors."}
            {" "}Real vendor data is not affected.
          </p>
        </div>
        <button type="button" className={visible ? "btn-ghost shrink-0" : "btn-primary shrink-0"} onClick={toggle} disabled={busy}>
          {busy ? "Saving…" : visible ? "Hide demo data" : "Reveal demo data"}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-xs text-ink-muted">{message}</p>}
    </section>
  );
}
