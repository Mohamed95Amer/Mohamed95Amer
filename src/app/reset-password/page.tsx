import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <div className="container-pro max-w-md py-16"><p className="eyebrow text-jade-600">Account security</p><h1 className="mt-2 font-serif text-4xl font-semibold text-jade-950">Choose a new password</h1><p className="mt-2 text-sm text-ink-muted">Use at least eight characters and avoid reusing another account’s password.</p><div className="card mt-6 p-6"><ResetPasswordForm /></div></div>;
}
