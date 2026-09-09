import Link from "next/link";
import { GoldPriceBadge } from "./GoldPriceBadge";
import { SignOutButton } from "./SignOutButton";
import { BrandMark } from "./BrandMark";
import { getCurrentProfile } from "@/lib/auth/server";

/**
 * Site header.
 *
 * Reads the session so a signed-in visitor can actually get somewhere: without
 * this the account area — and every reservation a customer has made — has no
 * link anywhere in the app, and the only sign-out control sits on a page you
 * cannot navigate to. Vendors and admins get a link to their own area by role.
 */
export async function SiteHeader() {
  const profile = await getCurrentProfile();
  const role = profile?.role as "customer" | "vendor" | "admin" | "super_admin" | undefined;
  const isAdmin = role === "admin" || role === "super_admin";
  const isVendor = role === "vendor" || isAdmin;

  return (
    <header className="sticky top-0 z-30 border-b border-jade-900/10 bg-white/90 shadow-sm backdrop-blur-xl">
      <div className="bg-jade-950 text-white">
        <div className="container-pro flex min-h-9 items-center justify-between gap-3 py-1.5">
          <p className="eyebrow truncate text-white/65">
            UAE gold marketplace
          </p>
          <div className="shrink-0">
            <GoldPriceBadge compact tone="dark" />
          </div>
        </div>
      </div>

      <div className="container-pro flex items-center justify-between gap-4 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="GoldHub home">
          <BrandMark />
          <span>
            <span className="block font-serif text-xl font-semibold leading-none tracking-tight text-jade-950">GoldHub</span>
            <span className="mt-0.5 hidden text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-muted sm:block">Gold, clearly priced</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-jade-900/10 bg-jade-50/70 p-1 text-sm text-ink-muted lg:flex">
          <Link href="/marketplace" className="rounded-full px-3.5 py-1.5 transition hover:bg-white hover:text-jade-900">Marketplace</Link>
          <Link href="/vendors" className="rounded-full px-3.5 py-1.5 transition hover:bg-white hover:text-jade-900">Vendors</Link>
          <Link href="/live-price" className="rounded-full px-3.5 py-1.5 transition hover:bg-white hover:text-jade-900">Live price</Link>
          <Link href="/how-it-works" className="rounded-full px-3.5 py-1.5 transition hover:bg-white hover:text-jade-900">How it works</Link>
          <Link href="/trust" className="rounded-full px-3.5 py-1.5 transition hover:bg-white hover:text-jade-900">Trust</Link>
        </nav>

        <div className="flex items-center gap-3">
          {profile ? (
            <>
              {isAdmin && (
                <Link href="/admin" className="hidden text-xs text-ink-muted hover:text-ink sm:block">
                  Admin
                </Link>
              )}
              {isVendor && (
                <Link href="/vendor" className="hidden text-xs text-ink-muted hover:text-ink sm:block">
                  Vendor
                </Link>
              )}
              <Link href="/account" className="btn-ghost px-4 py-2 text-xs">
                {firstName(profile.full_name) ?? "Account"}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="hidden text-sm font-semibold text-jade-900 transition hover:text-jade-600 sm:block">Sign in</Link>
              <Link href="/register" className="btn-primary px-4 py-2 text-xs">Get started</Link>
            </>
          )}
        </div>
      </div>

      {/* The primary nav is hidden on small screens above; keep it reachable. */}
      <nav className="container-pro flex gap-5 overflow-x-auto border-t border-jade-900/5 py-2.5 text-xs font-semibold text-ink-muted lg:hidden">
        <Link href="/marketplace" className="whitespace-nowrap hover:text-jade-700">Marketplace</Link>
        <Link href="/vendors" className="whitespace-nowrap hover:text-jade-700">Vendors</Link>
        <Link href="/live-price" className="whitespace-nowrap hover:text-jade-700">Live price</Link>
        <Link href="/how-it-works" className="whitespace-nowrap hover:text-jade-700">How it works</Link>
        <Link href="/trust" className="whitespace-nowrap hover:text-jade-700">Trust</Link>
      </nav>
    </header>
  );
}

function firstName(full?: string | null): string | null {
  const n = full?.trim().split(/\s+/)[0];
  return n && n.length > 0 ? n : null;
}
