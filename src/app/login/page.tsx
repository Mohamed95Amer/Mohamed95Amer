import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to your Get Gold account.", robots: { index: false, follow: false } };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <div className="container-pro grid min-h-[70vh] items-center gap-10 py-12 lg:grid-cols-[1fr_0.8fr] lg:py-16">
      <section className="hidden max-w-xl lg:block">
        <p className="eyebrow text-jade-600">Your gold, in one place</p>
        <h1 className="mt-3 font-serif text-5xl font-semibold leading-tight tracking-tight text-jade-950">Return to your reservations and purchase insights.</h1>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {["Live price locks", "Purchase history", "Verified reviews"].map((item) => <div key={item} className="rounded-2xl bg-jade-50 p-4 text-sm font-semibold text-jade-900">✓ {item}</div>)}
        </div>
      </section>
      <section className="mx-auto w-full max-w-md">
        <p className="eyebrow text-jade-600 lg:hidden">Welcome back</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">Sign in</h1>
        <p className="mt-2 text-sm text-ink-muted">Access your Get Gold account securely.</p>
        <div className="card mt-6 p-6 sm:p-7"><LoginForm next={searchParams.next} error={searchParams.error} /></div>
        <p className="mt-4 text-sm text-ink-muted">Don&apos;t have an account? <Link href="/register" className="font-semibold text-jade-700 underline underline-offset-4">Create one</Link></p>
      </section>
    </div>
  );
}
