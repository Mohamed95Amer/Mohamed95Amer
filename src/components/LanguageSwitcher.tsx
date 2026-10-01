"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { twinRatePath } from "@/lib/gold-rate/core";

export function LanguageSwitcher({ language }: { language: "en" | "ar" }) { const router = useRouter(); const pathname = usePathname(); const [busy, setBusy] = useState(false); async function toggle() { setBusy(true); const next = language === "en" ? "ar" : "en"; try { await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: next }) }); const twin = twinRatePath(pathname ?? ""); if (twin) router.push(twin); else router.refresh(); } finally { setBusy(false); } } return <button type="button" className="min-h-11 rounded px-2.5 text-xs font-semibold text-jade-800 transition hover:bg-jade-50" onClick={toggle} disabled={busy} aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}>{busy ? "…" : language === "en" ? "العربية" : "English"}</button>; }
