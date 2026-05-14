import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <div className="container-pro py-16 max-w-md">
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="text-sm text-ink-muted mt-1">Welcome back to GoldHub.</p>
      <div className="card mt-6 p-6">
        <LoginForm next={searchParams.next} error={searchParams.error} />
      </div>
      <p className="text-sm text-ink-muted mt-4">
        Don't have an account? <Link href="/register" className="underline">Create one</Link>
      </p>
    </div>
  );
}
