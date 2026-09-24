"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-pro grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="max-w-lg">
        <p className="eyebrow text-signal-err">Something interrupted this page</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold text-jade-950">Let’s try that again.</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">Your reservation and account data have not been changed. Refresh the page, or contact support if the problem continues.</p>
        <button type="button" onClick={reset} className="btn-primary mt-6">Retry</button>
      </div>
    </div>
  );
}
