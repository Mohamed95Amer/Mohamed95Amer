import type { Metadata } from "next";
import Link from "next/link";
import { safeInternalRedirect } from "@/lib/auth/redirect";
import { VerifyEmailForm } from "./VerifyEmailForm";

export const metadata: Metadata = {
  title: "Confirm your email",
  description: "Confirm your Get Gold email address before signing in.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const query = await searchParams;
  const email = typeof query.email === "string" && query.email.includes("@") ? query.email : "";
  const next = safeInternalRedirect(query.next);

  return (
    <div className="container-pro grid max-w-5xl gap-10 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-20">
      <section>
        <p className="eyebrow text-jade-600">One quick step</p>
        <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight tracking-tight text-jade-950 sm:text-5xl">Confirm your email to continue.</h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">We use email confirmation to protect your account and keep reservation and identity records tied to the right person.</p>
        <div className="mt-6 space-y-3 text-sm text-ink-muted">
          <p>Open the message from Get Gold and select the confirmation link.</p>
          <p>The link returns you to the correct customer, vendor or delivery-company setup.</p>
          <p>Nothing is charged and no order is created during confirmation.</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-xl">
        <div className="card p-6 sm:p-8">
          <VerifyEmailForm email={email} next={next} />
        </div>
        <p className="mt-4 text-sm text-ink-muted">Already confirmed? <Link href="/login" className="font-semibold text-jade-700 underline underline-offset-4">Sign in</Link></p>
      </section>
    </div>
  );
}
