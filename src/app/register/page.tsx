import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Create account", description: "Create a GoldHub customer or vendor account.", robots: { index: false, follow: false } };

export default function RegisterPage({ searchParams }: { searchParams: { role?: string } }) {
  const role = searchParams.role === "vendor" ? "vendor" : "customer";
  return (
    <div className="container-pro grid gap-10 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:py-16">
      <section className="lg:sticky lg:top-40">
        <p className="eyebrow text-jade-600">Join GoldHub</p>
        <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">{role === "vendor" ? "Bring your gold shop into the live market." : "Reserve gold with the price in plain sight."}</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{role === "vendor" ? "Create your account, then submit the business evidence needed for manual verification." : "Save your locked-price history, follow the comparable gold value and review completed purchases."}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/register" className={`pill min-h-10 px-4 ${role === "customer" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>Customer</Link>
          <Link href="/register?role=vendor" className={`pill min-h-10 px-4 ${role === "vendor" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>Vendor</Link>
        </div>
      </section>
      <section className="mx-auto w-full max-w-xl">
        <div className="card p-6 sm:p-8"><RegisterForm initialRole={role} /></div>
        <p className="mt-4 text-sm text-ink-muted">Already have an account? <Link href="/login" className="font-semibold text-jade-700 underline underline-offset-4">Sign in</Link></p>
      </section>
    </div>
  );
}
