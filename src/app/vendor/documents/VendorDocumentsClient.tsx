"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const DOC_TYPES = [
  ["trade_license", "Trade license"],
  ["emirates_id", "Emirates ID"],
  ["passport", "Passport"],
  ["vat_certificate", "VAT certificate"],
  ["store_photo", "Store photo"],
  ["authorization_letter", "Authorization letter"],
] as const;

interface Doc {
  id: string;
  doc_type: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  uploaded_at: string;
}

export function VendorDocumentsClient({ vendorId, initialDocs }: { vendorId: string; initialDocs: Doc[] }) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number][0]>("trade_license");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${vendorId}/${docType}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("vendor-docs")
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (upErr) {
      setBusy(false);
      setErr(upErr.message);
      return;
    }
    // Insert a metadata row via the API so we keep it in audit_logs/RLS-friendly format
    const res = await fetch("/api/vendor/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor_id: vendorId,
        doc_type: docType,
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "Failed to record document");
      return;
    }
    const j = await res.json();
    setDocs((d) => [j.doc, ...d]);
    router.refresh();
  }

  async function viewDoc(path: string) {
    const res = await fetch("/api/vendor/documents/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return;
    const j = await res.json();
    window.open(j.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="label">Document type</label>
        <select className="input" value={docType} onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number][0])}>
          {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="mt-3">
          <input type="file" disabled={busy} onChange={onUpload} className="text-sm" />
        </div>
        {err && <p className="mt-2 text-sm text-signal-err">{err}</p>}
      </div>

      <div>
        <h2 className="font-serif text-xl">Uploaded</h2>
        <ul className="mt-3 divide-y divide-bone-deep">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{d.original_filename ?? d.storage_path}</div>
                <div className="text-xs text-ink-muted">{d.doc_type} · {d.mime_type} · {d.size_bytes ? Math.round(d.size_bytes/1024) : 0} KB</div>
              </div>
              <button className="btn-ghost text-xs" onClick={() => viewDoc(d.storage_path)}>View</button>
            </li>
          ))}
          {docs.length === 0 && <li className="py-3 text-ink-muted">No documents uploaded yet.</li>}
        </ul>
      </div>
    </div>
  );
}
