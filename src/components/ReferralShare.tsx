"use client";

import { useState } from "react";

export function ReferralShare({ url }: { url: string }) { const [copied, setCopied] = useState(false); async function share() { void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventName: "referral_shared" }) }); if (navigator.share) { await navigator.share({ title: "Get Gold", text: "Compare transparent live-priced gold from verified UAE stores.", url }).catch(() => undefined); return; } await navigator.clipboard.writeText(url); setCopied(true); } return <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input className="input flex-1" readOnly value={url} aria-label="Referral link" /><button type="button" className="btn-primary whitespace-nowrap" onClick={share}>{copied ? "Copied" : "Share Get Gold"}</button></div>; }

