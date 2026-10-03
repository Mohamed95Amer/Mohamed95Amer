"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Issue {
  line: number | null;
  column: string | null;
  message: string;
}

interface CheckResult {
  ok: boolean;
  committed: boolean;
  row_count: number;
  issues: Issue[];
  preview?: Array<Record<string, unknown>>;
  status?: string;
}

/** Mirrors BULK_MAX_BYTES on the server; checked here only to fail fast. */
const MAX_BYTES = 1_000_000;

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Your session has expired. Sign in again.",
  no_vendor: "Your vendor account could not be found.",
  vendor_not_approved:
    "Your vendor account is not approved yet, so products cannot be submitted for approval. " +
    "Upload them as drafts for now.",
  rate_limited: "Too many bulk uploads in the last hour. Try again later.",
  invalid_json: "The upload could not be read. Try again.",
  invalid_input: "The file is too large or empty.",
  insert_failed: "The products could not be created. Nothing was saved.",
};

export function BulkUploadClient({
  vendorApproved,
  maxRows,
}: {
  vendorApproved: boolean;
  maxRows: number;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitForApproval, setSubmitForApproval] = useState(false);
  const [busy, setBusy] = useState<"check" | "commit" | null>(null);
  const [done, setDone] = useState<{ count: number; status: string } | null>(null);

  function reset() {
    setCsv(null);
    setFileName(null);
    setResult(null);
    setError(null);
    setDone(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onPick(file: File | undefined) {
    setResult(null);
    setError(null);
    setDone(null);
    if (!file) {
      setCsv(null);
      setFileName(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setCsv(null);
      setFileName(file.name);
      setError(`That file is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is 1 MB.`);
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    await send(text, false);
  }

  async function send(text: string, commit: boolean) {
    setBusy(commit ? "commit" : "check");
    setError(null);
    try {
      const res = await fetch("/api/vendor/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, commit, submit_for_approval: submitForApproval }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = typeof body.error === "string" ? body.error : "";
        setError(ERROR_TEXT[key] ?? (typeof body.message === "string" ? body.message : "The upload failed."));
        return;
      }
      if (body.committed) {
        setDone({ count: body.row_count, status: body.status ?? "draft" });
        setResult(null);
        router.refresh();
        return;
      }
      setResult(body as CheckResult);
    } catch {
      setError("The upload could not be sent. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  // --- after a successful import --------------------------------------------
  if (done) {
    return (
      <div className="card mt-8 p-6">
        <h2 className="font-serif text-xl">
          {done.count} {done.count === 1 ? "product" : "products"} created
        </h2>
        <p className="text-sm text-ink-muted mt-1">
          {done.status === "pending_approval"
            ? "They have been submitted for admin approval."
            : "They were saved as drafts. Open each one to add photos, then submit it for approval."}
        </p>
        <div className="mt-4 flex gap-3">
          <button type="button" className="btn-primary" onClick={() => router.push("/vendor/products")}>
            View my products
          </button>
          <button type="button" className="btn-ghost" onClick={reset}>
            Upload another file
          </button>
        </div>
      </div>
    );
  }

  const issues = result?.issues ?? [];
  const readyCount = result?.ok ? result.row_count : 0;

  return (
    <div className="card mt-8 p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grow">
          <label className="label" htmlFor="bulk-file">CSV file</label>
          <input
            id="bulk-file"
            ref={fileInput}
            className="input"
            type="file"
            accept=".csv,text/csv"
            disabled={busy !== null}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <p className="text-xs text-ink-muted mt-1">
            One row per product, up to {maxRows} rows. Checked before anything is created.
          </p>
        </div>
        <a className="btn-ghost" href="/api/vendor/products/bulk" download>
          Download template
        </a>
      </div>

      {busy === "check" && <p className="text-sm text-ink-muted mt-4">Checking {fileName}…</p>}

      {error && (
        <div className="mt-4 rounded-md border border-signal-err/30 bg-signal-err/5 p-4">
          <p className="text-sm text-signal-err">{error}</p>
        </div>
      )}

      {/* --- problems found ---------------------------------------------- */}
      {issues.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium text-signal-err">
            {issues.length === 1 ? "1 problem" : `${issues.length} problems`} found — nothing was created
          </h3>
          <p className="text-sm text-ink-muted mt-1">
            Fix these rows in your spreadsheet, save it again, and upload it once more. Row numbers
            match the rows in your file.
          </p>
          <div className="card mt-3 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-ink-muted">
                <tr>
                  <th className="px-4 py-2 text-left w-20">Row</th>
                  <th className="px-4 py-2 text-left w-40">Column</th>
                  <th className="px-4 py-2 text-left">Problem</th>
                </tr>
              </thead>
              <tbody>
                {issues.slice(0, 100).map((issue, i) => (
                  <tr key={i} className="border-t border-bone-deep align-top">
                    <td className="px-4 py-2">{issue.line ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{issue.column ?? "—"}</td>
                    <td className="px-4 py-2">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {issues.length > 100 && (
            <p className="text-sm text-ink-muted mt-2">
              Showing the first 100 of {issues.length}. Fix these and upload again to see the rest.
            </p>
          )}
        </div>
      )}

      {/* --- file is good, confirm --------------------------------------- */}
      {result?.ok && !result.committed && (
        <div className="mt-6">
          <h3 className="font-medium text-signal-ok">
            {readyCount} {readyCount === 1 ? "product is" : "products are"} ready to create
          </h3>
          <p className="text-sm text-ink-muted mt-1">
            No products have been created yet. Check the first few rows below, then confirm.
          </p>

          {result.preview && result.preview.length > 0 && (
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bone-soft text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Row</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Category</th>
                    <th className="px-4 py-2 text-right">Karat</th>
                    <th className="px-4 py-2 text-right">Weight (g)</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((p, i) => (
                    <tr key={i} className="border-t border-bone-deep">
                      <td className="px-4 py-2">{String(p.line)}</td>
                      <td className="px-4 py-2 font-medium">{String(p.name)}</td>
                      <td className="px-4 py-2">{String(p.category)}</td>
                      <td className="px-4 py-2 text-right">{String(p.karat)}K</td>
                      <td className="px-4 py-2 text-right">{String(p.weight_grams)}</td>
                      <td className="px-4 py-2 text-right">{String(p.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.preview && readyCount > result.preview.length && (
            <p className="text-sm text-ink-muted mt-2">
              Showing {result.preview.length} of {readyCount} rows.
            </p>
          )}

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={submitForApproval}
              disabled={!vendorApproved}
              onChange={(e) => setSubmitForApproval(e.target.checked)}
            />
            <span>
              Submit all of them for admin approval straight away.
              {!vendorApproved && (
                <span className="block text-ink-muted">
                  Available once your vendor account is approved. For now they will be saved as drafts.
                </span>
              )}
              {vendorApproved && (
                <span className="block text-ink-muted">
                  Otherwise they are saved as drafts, so you can add photos first.
                </span>
              )}
            </span>
          </label>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== null || csv === null}
              onClick={() => csv && send(csv, true)}
            >
              {busy === "commit"
                ? "Creating…"
                : `Create ${readyCount} ${readyCount === 1 ? "product" : "products"}`}
            </button>
            <button type="button" className="btn-ghost" disabled={busy !== null} onClick={reset}>
              Choose a different file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
