"use client";

import { useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { PRODUCT_IMAGE_BUCKET, publicStorageUrl } from "@/lib/storage";

const MAX_FILES = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Uploads product photos straight from the browser to the product-images
 * bucket and hands back their storage paths.
 *
 * Files land under `<vendor_id>/…`, which is what the bucket's write policy
 * checks — a vendor can only write inside their own folder. The value stored
 * on the product is the path, not a URL, so moving projects or rotating the
 * domain later does not invalidate anything.
 */
export function ProductImageUploader({
  vendorId,
  value,
  onChange,
  onBusyChange,
  arabic = false,
}: {
  vendorId: string;
  value: string[];
  onChange: (paths: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  arabic?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);

    const room = MAX_FILES - value.length;
    if (room <= 0) {
      setErr(`You can attach up to ${MAX_FILES} photos.`);
      return;
    }

    const chosen = Array.from(files).slice(0, room);
    for (const f of chosen) {
      if (!ACCEPTED.includes(f.type)) {
        setErr(`${f.name} is not a JPEG, PNG, WebP or AVIF.`);
        return;
      }
      if (f.size > MAX_BYTES) {
        setErr(`${f.name} is larger than 5 MB.`);
        return;
      }
    }

    setBusy(true);
    onBusyChange?.(true);
    const supabase = getBrowserSupabase();
    const added: string[] = [];

    try {
      for (const file of chosen) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${vendorId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
          setErr(`Could not upload ${file.name}: ${error.message}`);
          break;
        }
        added.push(path);
      }
    } catch {
      setErr(arabic ? "تعذر رفع الصور. حاول مرة أخرى." : "Upload interrupted. Please retry the remaining photos.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
      if (added.length) onChange([...value, ...added]);
    }
  }

  function remove(path: string) {
    onChange(value.filter((p) => p !== path));
  }

  function move(path: string, dir: -1 | 1) {
    const i = value.indexOf(path);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      <label htmlFor="product-photos" className="label">{arabic ? "صور المنتج" : "Product photos"}</label>
      <p className="mb-2 text-xs text-ink-muted">
        {arabic ? "الصورة الأولى هي الرئيسية. حتى ٨ صور، ٥ ميغابايت لكل صورة. أضف صورة فعلية واحدة على الأقل لإرسال المنتج للمراجعة." : "The first photo is the cover. Up to 8 photos, 5 MB each. Add at least one actual product photo before submitting for review."}
      </p>

      {value.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {value.map((path, i) => (
            <li key={path} className="group relative overflow-hidden rounded-lg border border-bone-deep bg-bone-soft">
              <div className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicStorageUrl(path) ?? ""}
                  alt={`Product photo ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
              {i === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold text-bone">
                  {arabic ? "رئيسية" : "Cover"}
                </span>
              )}
              <div className="flex justify-between gap-1 bg-ink/80 p-1">
                <button type="button" onClick={() => move(path, -1)} disabled={busy || i === 0}
                  className="min-h-11 min-w-8 px-1.5 text-xs text-bone disabled:opacity-30" aria-label={arabic ? "تقديم الصورة" : "Move earlier"}>←</button>
                <button type="button" onClick={() => remove(path)}
                  disabled={busy} className="min-h-11 px-1.5 text-xs text-bone" aria-label={arabic ? "إزالة الصورة" : "Remove photo"}>{arabic ? "إزالة" : "Remove"}</button>
                <button type="button" onClick={() => move(path, 1)} disabled={busy || i === value.length - 1}
                  className="min-h-11 min-w-8 px-1.5 text-xs text-bone disabled:opacity-30" aria-label={arabic ? "تأخير الصورة" : "Move later"}>→</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        id="product-photos"
        name="product_photos"
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        disabled={busy || value.length >= MAX_FILES}
        onChange={(e) => handleFiles(e.target.files)}
        className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-bone hover:file:bg-ink-soft disabled:opacity-50"
      />
      {busy && <p role="status" className="mt-2 text-xs text-ink-muted">{arabic ? "جارٍ رفع الصور…" : "Uploading photos…"}</p>}
      {err && <p role="alert" className="mt-2 text-xs text-signal-err">{err}</p>}
    </div>
  );
}
