import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <div className="container-pro max-w-md py-16"><p className="eyebrow text-jade-600">Account recovery</p><h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">Reset your password</h1><p className="mt-2 text-sm leading-relaxed text-ink-muted">We’ll email a secure link if an account exists for that address.</p><div className="card mt-6 p-6"><ForgotPasswordForm /></div><p className="mt-4 text-sm text-ink-muted"><Link href="/login" className="font-semibold text-jade-700 underline underline-offset-4">Return to sign in</Link></p></div>;
}
