"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LanguageSwitcher({ language }: { language: "en" | "ar" }) { const router = useRouter(); const [busy, setBusy] = useState(false); async function toggle() { setBusy(true); const next = language === "en" ? "ar" : "en"; await fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: next }) }); setBusy(false); router.refresh(); } return <button type="button" className="rounded-full px-2.5 py-1 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white" onClick={toggle} disabled={busy} aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}>{busy ? "…" : language === "en" ? "العربية" : "English"}</button>; }

