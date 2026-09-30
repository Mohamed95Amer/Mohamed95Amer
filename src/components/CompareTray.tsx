"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function CompareTray({ arabic = false }: { arabic?: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => { try { const value = JSON.parse(localStorage.getItem("gg_compare") || "[]"); setIds(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 4) : []); } catch { setIds([]); } };
    sync(); window.addEventListener("gg-compare-change", sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener("gg-compare-change", sync); window.removeEventListener("storage", sync); };
  }, []);
  if (ids.length === 0) return null;
  return <aside className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-gold-300/30 bg-jade-950 px-4 py-3 text-white shadow-lift" dir={arabic ? "rtl" : "ltr"}><div><p className="text-sm font-semibold">{arabic ? `${ids.length} قطع مختارة` : `${ids.length} item${ids.length === 1 ? "" : "s"} selected`}</p><p className="text-[11px] text-white/55">{arabic ? "قارن حتى أربع قطع مختارة" : "Compare up to four selected pieces"}</p></div><div className="flex gap-2"><button type="button" onClick={() => { localStorage.removeItem("gg_compare"); setIds([]); }} className="rounded-full px-3 py-2 text-xs text-white/70">{arabic ? "مسح" : "Clear"}</button><Link href={`/compare?ids=${ids.join(",")}`} className="rounded-full bg-gold-300 px-4 py-2 text-xs font-bold text-jade-950">{arabic ? "قارن المختار" : "Compare selected"}</Link></div></aside>;
}
