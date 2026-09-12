"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UAE_EMIRATES } from "@/lib/fulfilment";

const CATEGORIES = ["ring", "necklace", "bracelet", "earring", "bangle", "chain", "pendant", "bar", "coin", "other"];

export function BuyerRequestForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    let referenceImagePath: string | null = null;
    const image = form.get("referenceImage");
    try {
      if (image instanceof File && image.size > 0) {
        const upload = new FormData();
        upload.set("file", image);
        const uploadResponse = await fetch("/api/buyer-requests/reference-image", { method: "POST", body: upload });
        const uploadJson = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadJson.message ?? uploadJson.error ?? "Image upload failed");
        referenceImagePath = uploadJson.path;
      }
      const response = await fetch("/api/buyer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.get("category"),
          karat: Number(form.get("karat")),
          budgetMinAed: Number(form.get("budgetMinAed")),
          budgetMaxAed: Number(form.get("budgetMaxAed")),
          emirate: form.get("emirate"),
          neededBy: form.get("neededBy") || null,
          description: form.get("description"),
          referenceImagePath,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error === "customer_account_required" ? "Use a customer account to submit a request." : json.error ?? "Could not submit request");
      router.push("/account/requests");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid gap-5 p-6 sm:p-8" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What are you looking for?" htmlFor="request-category">
          <select id="request-category" name="category" className="input capitalize" required>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
        </Field>
        <Field label="Gold purity" htmlFor="request-karat">
          <select id="request-karat" name="karat" className="input" defaultValue="22" required>{[18, 21, 22, 24].map((karat) => <option key={karat} value={karat}>{karat}K</option>)}</select>
        </Field>
        <Field label="Minimum budget (AED)" htmlFor="request-budget-min">
          <input id="request-budget-min" name="budgetMinAed" className="input" type="number" min="0" step="50" defaultValue="0" required />
        </Field>
        <Field label="Maximum budget (AED)" htmlFor="request-budget-max">
          <input id="request-budget-max" name="budgetMaxAed" className="input" type="number" min="1" step="50" required />
        </Field>
        <Field label="Preferred emirate" htmlFor="request-emirate">
          <select id="request-emirate" name="emirate" className="input" defaultValue="Dubai" required>{UAE_EMIRATES.map((emirate) => <option key={emirate}>{emirate}</option>)}</select>
        </Field>
        <Field label="Needed by (optional)" htmlFor="request-needed-by">
          <input id="request-needed-by" name="neededBy" className="input" type="date" min={new Date().toISOString().slice(0, 10)} />
        </Field>
      </div>
      <Field label="Describe the piece" htmlFor="request-description">
        <textarea id="request-description" name="description" className="input min-h-32" minLength={20} maxLength={2000} required placeholder="Style, size, stones, engraving, occasion, and anything the jeweller should know." />
      </Field>
      <Field label="Reference image (optional)" htmlFor="request-image">
        <input id="request-image" name="referenceImage" className="input py-2" type="file" accept="image/jpeg,image/png,image/webp" />
        <p className="mt-1 text-xs text-ink-muted">Private JPG, PNG or WebP up to 5 MB. Verified stores reviewing the request receive a short-lived viewing link.</p>
      </Field>
      <div className="rounded-xl border border-jade-900/10 bg-jade-50 p-4 text-xs leading-relaxed text-ink-muted">
        Submitting is free and does not place an order. Stores respond with item-specific offers; you choose whether to continue.
      </div>
      {error && <p role="alert" className="text-sm text-signal-err">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Send request to verified stores"}</button>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <div><label className="label" htmlFor={htmlFor}>{label}</label>{children}</div>;
}
