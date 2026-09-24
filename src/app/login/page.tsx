import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to your Get Gold account.", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; role?: string }> }) {
  const query = await searchParams;
  const vendorMode = query.role === "vendor" || (query.next?.startsWith("/vendor") ?? false);

  if (vendorMode) {
    return (
      <main className="relative overflow-hidden bg-[#f7f1e8] py-8 sm:py-12 lg:py-16">
        <div className="pointer-events-none absolute -left-40 top-16 h-96 w-96 rounded-full bg-[#d6b66b]/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-[32rem] w-[32rem] rounded-full bg-[#0b4f42]/10 blur-3xl" />
        <div className="container-pro relative">
          <div className="mb-8 flex items-center justify-between gap-4 sm:mb-10">
            <div>
              <p className="eyebrow text-gold-700">Get Gold partner portal</p>
              <p className="mt-1 text-xs text-ink-muted">Private access for approved and applying UAE jewellery businesses</p>
            </div>
            <Link href="/" className="text-xs font-semibold text-jade-800 transition hover:text-jade-600">Back to marketplace →</Link>
          </div>
          <div className="grid overflow-hidden rounded-[2rem] border border-[#b89b61]/25 bg-[#fffdfa]/90 shadow-[0_30px_90px_rgba(32,50,43,0.13)] lg:grid-cols-[1.08fr_0.92fr]">
            <section className="relative flex min-h-[34rem] flex-col justify-between overflow-hidden bg-[#0c4138] p-7 text-white sm:p-10 lg:p-14">
              <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="absolute -right-8 -top-12 h-52 w-52 rounded-full border border-[#d6b66b]/25" />
              <div className="absolute bottom-0 left-0 h-48 w-full bg-gradient-to-t from-black/20 to-transparent" />
              <div className="relative">
                <div className="flex items-center gap-3 text-[#e3c77b]">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b66b]/50 bg-[#d6b66b]/10 text-lg">✦</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em]">Vendor sign in</span>
                </div>
                <h1 className="mt-9 max-w-lg font-serif text-4xl font-semibold leading-[1.04] tracking-[-0.03em] sm:text-5xl">Put your shop in front of buyers ready for gold.</h1>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">Manage your verified store, publish live-priced listings and respond to reservations from one calm workspace.</p>
              </div>
              <div className="relative mt-12 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[{ n: "01", title: "Verified presence", body: "Trade-licence review keeps the marketplace trusted." }, { n: "02", title: "Transparent pricing", body: "Show karat, making, VAT and certificate costs clearly." }, { n: "03", title: "Direct fulfilment", body: "Confirm the item, collect payment and fulfil on your terms." }].map((item) => (
                  <div key={item.n} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-3"><span className="text-xs font-semibold text-[#e3c77b]">{item.n}</span><h2 className="text-sm font-semibold">{item.title}</h2></div>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">{item.body}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="p-6 sm:p-10 lg:p-14">
              <div className="max-w-md">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="eyebrow text-jade-600">Welcome back</p><h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-jade-950">Vendor sign in</h2></div>
                  <span className="rounded-full border border-signal-ok/25 bg-signal-ok/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-ok">Secure access</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">Use the email you registered for your store. Your account role and review status are applied automatically.</p>
                <div className="mt-7 rounded-2xl border border-jade-900/10 bg-[#f6f2eb] p-4">
                  <div className="flex gap-3"><span className="mt-0.5 text-gold-700">◈</span><div><p className="text-xs font-semibold text-jade-950">Your customer payments stay with your store</p><p className="mt-1 text-xs leading-relaxed text-ink-muted">Get Gold provides discovery, reservations and pricing clarity. Confirm the exact item before you arrange payment.</p></div></div>
                </div>
                <div className="card mt-5 border-jade-900/10 bg-white p-5 sm:p-6"><LoginForm next={query.next} error={query.error} /></div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted"><span>Not listed yet?</span><Link href="/register?role=vendor" className="font-semibold text-jade-700 underline underline-offset-4">Apply as a vendor →</Link></div>
                <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-muted">By signing in, you agree to keep listing, stock and business details accurate. Need help? <Link href="/contact" className="font-semibold text-jade-700 underline underline-offset-4">Contact partner support</Link>.</p>
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

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
        <div className="card mt-6 p-6 sm:p-7"><LoginForm next={query.next} error={query.error} /></div>
        <p className="mt-4 text-sm text-ink-muted">Don&apos;t have an account? <Link href="/register" className="font-semibold text-jade-700 underline underline-offset-4">Create one</Link></p>
      </section>
    </div>
  );
}
