"use client";
import { useState, type ReactNode } from "react";
export function VendorCollection({ items, filters, initialFilter = "all", arabic = false, placeholder, empty }: {
  items: { id: string; group: string; search: string; content: ReactNode }[];
  filters: { value: string; label: string }[];
  initialFilter?: string; arabic?: boolean; placeholder: string; empty: ReactNode;
}) {
  const [filter, setFilter] = useState(filters.some(f => f.value === initialFilter) ? initialFilter : "all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const filtered = items.filter(item => (filter === "all" || item.group === filter) && item.search.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="mt-6 min-w-0 space-y-5">
    <div className="rounded-2xl border border-jade-900/10 bg-white p-3 sm:p-4">
      <label className="block"><span className="sr-only">{placeholder}</span><input type="search" className="input" placeholder={placeholder} value={query} onChange={e => { setQuery(e.target.value); setLimit(12); }} /></label>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={arabic ? "تصفية النتائج" : "Filter results"}>{filters.map(f => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => { setFilter(f.value); setLimit(12); }} className={`min-h-11 rounded-xl px-3 py-2 text-sm transition ${filter === f.value ? "bg-jade-900 font-semibold text-white" : "bg-bone-soft text-ink-muted hover:bg-jade-50"}`}>{f.label}<span className="ms-2 opacity-70">{f.value === "all" ? items.length : items.filter(i => i.group === f.value).length}</span></button>)}</div>
    </div>
    <p className="text-xs text-ink-muted" role="status">{filtered.length} {arabic ? "نتيجة" : "results"}</p>
    {filtered.length ? <div className="grid gap-4">{filtered.slice(0, limit).map(item => <div key={item.id} className="min-w-0">{item.content}</div>)}</div> : <div className="card px-6 py-12 text-center"><div className="mx-auto max-w-md text-sm leading-relaxed text-ink-muted">{query || filter !== "all" ? <><p>{arabic ? "لا توجد نتائج مطابقة. جرّب تصفية أخرى أو كلمة بحث مختلفة." : "No matching results. Try another filter or search."}</p><button type="button" className="btn-ghost mt-4" onClick={() => { setQuery(""); setFilter("all"); }}>{arabic ? "عرض الكل" : "Show everything"}</button></> : empty}</div></div>}
    {filtered.length > limit && <button className="btn-ghost w-full" onClick={() => setLimit(limit + 12)}>{arabic ? "تحميل المزيد" : "Show more"}</button>}
  </section>;
}
