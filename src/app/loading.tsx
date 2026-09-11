export default function Loading() {
  return (
    <div className="container-pro py-12" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading GoldHub</span>
      <div className="h-4 w-32 animate-pulse rounded-full bg-jade-100" />
      <div className="mt-5 h-12 max-w-lg animate-pulse rounded-2xl bg-jade-100" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-80 animate-pulse rounded-2xl border border-jade-900/5 bg-white shadow-sm" />)}
      </div>
    </div>
  );
}
