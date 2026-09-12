import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Create account", description: "Create a Get Gold customer, vendor or delivery company account.", robots: { index: false, follow: false } };

export default function RegisterPage({ searchParams }: { searchParams: { role?: string } }) {
  const role = searchParams.role === "vendor" ? "vendor" : searchParams.role === "delivery_company" ? "delivery_company" : "customer";
  const copy = role === "vendor"
    ? { title: "Bring your gold shop into the live market.", body: "Create your account, then submit the business evidence needed for manual verification." }
    : role === "delivery_company"
      ? { title: "Join the trusted delivery network.", body: "Create your account, define your licensed service coverage and submit it for admin review." }
      : { title: "See the price. Get the gold.", body: "Save locked-price history, follow comparable gold value and review completed purchases." };
  return (
    <div className="container-pro grid gap-10 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:py-16">
      <section className="lg:sticky lg:top-40">
        <p className="eyebrow text-jade-600">Join Get Gold</p>
        <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">{copy.title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">{copy.body}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/register" className={`pill min-h-10 px-4 ${role === "customer" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>Customer</Link>
          <Link href="/register?role=vendor" className={`pill min-h-10 px-4 ${role === "vendor" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>Vendor</Link>
          <Link href="/register?role=delivery_company" className={`pill min-h-10 px-4 ${role === "delivery_company" ? "border-jade-700 bg-jade-700 text-white" : "border-jade-900/10 bg-white text-jade-900"}`}>Delivery company</Link>
        </div>
      </section>
      <section className="mx-auto w-full max-w-xl">
        <div className="card p-6 sm:p-8"><RegisterForm initialRole={role} /></div>
        <p className="mt-4 text-sm text-ink-muted">Already have an account? <Link href="/login" className="font-semibold text-jade-700 underline underline-offset-4">Sign in</Link></p>
      </section>
    </div>
  );
}
