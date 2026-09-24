"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function InventoryConfirmationButton({ productId, arabic = false }: { productId?: string; arabic?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function confirm() {
    if (!productId && !window.confirm(arabic ? "هل تحققت من كميات جميع المنتجات المعتمدة؟" : "Have you checked the quantities of all your approved products?")) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/vendor/inventory-confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: productId ?? null }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(arabic ? "تعذر تأكيد المخزون. حاول مرة أخرى." : "Could not confirm stock. Please retry."); return; }
      setMessage(arabic ? `تم تحديث ${json.confirmed} منتج.` : `${json.confirmed} listings refreshed.`); router.refresh();
    } catch { setMessage(arabic ? "تعذر الاتصال. حاول مرة أخرى." : "Connection failed. Please retry."); } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-ghost min-h-11 px-4 py-2 text-xs" onClick={confirm} disabled={busy}>{busy ? (arabic ? "جارٍ التحديث…" : "Refreshing…") : productId ? (arabic ? "تأكيد المخزون" : "Confirm stock") : (arabic ? "تأكيد جميع المنتجات" : "Confirm checked stock")}</button>{message && <span className="text-xs text-ink-muted" role="status">{message}</span>}</div>;
}
