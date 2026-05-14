import Link from "next/link";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <div className="container-pro py-16 max-w-md">
      <h1 className="font-serif text-3xl">Create your account</h1>
      <p className="text-sm text-ink-muted mt-1">Sign up to reserve gold from verified UAE vendors.</p>
      <div className="card mt-6 p-6">
        <RegisterForm />
      </div>
      <p className="text-sm text-ink-muted mt-4">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </div>
  );
}
