"use client";

import { useState } from "react";

export function ProductActions({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: `${name} | GoldHub`, text: `See ${name} on GoldHub`, url: window.location.href }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <button type="button" onClick={share} className="btn-ghost mt-5 px-4 text-xs" aria-live="polite"><span aria-hidden="true">↗</span>&nbsp; {copied ? "Link copied" : "Share product"}</button>;
}
