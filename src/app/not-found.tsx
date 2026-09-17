import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-pro grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="max-w-lg">
        <p className="eyebrow text-gold-600">404 · Not found</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold text-jade-950">This piece is no longer here.</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">The listing may have been sold, removed or replaced. The current marketplace has the latest approved inventory.</p>
        <Link href="/marketplace" className="btn-primary mt-6">Browse available gold</Link>
      </div>
    </div>
  );
}
