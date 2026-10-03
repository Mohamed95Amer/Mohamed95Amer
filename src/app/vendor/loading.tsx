export default function VendorLoading() {
  return <div className="container-pro space-y-6 py-10" role="status" aria-label="Loading store workspace"><div className="h-44 animate-pulse rounded-3xl bg-jade-900/10" /><div className="h-16 animate-pulse rounded-2xl bg-jade-900/5" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-jade-900/5" />)}</div><span className="sr-only">Loading…</span></div>;
}
