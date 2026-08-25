import Link from "next/link";
import { GoldPriceBadge } from "./GoldPriceBadge";
import { SignOutButton } from "./SignOutButton";
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
    <header className="border-b border-bone-deep bg-bone-soft/80 backdrop-blur sticky top-0 z-30">
      <div className="container-pro flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-full bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600" />
          <span className="font-serif text-xl tracking-tight">GoldHub</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-ink-muted md:flex">
          <Link href="/marketplace" className="hover:text-ink">Marketplace</Link>
          <Link href="/vendors" className="hover:text-ink">Vendors</Link>
          <Link href="/live-price" className="hover:text-ink">Live Price</Link>
          <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
          <Link href="/trust" className="hover:text-ink">Trust</Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block"><GoldPriceBadge compact /></div>

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
              <Link href="/account" className="btn-ghost text-xs">
                {firstName(profile.full_name) ?? "Account"}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost text-xs">Sign in</Link>
              <Link href="/register" className="btn-primary text-xs">Get started</Link>
            </>
          )}
        </div>
      </div>

      {/* The primary nav is hidden on small screens above; keep it reachable. */}
      <nav className="container-pro flex gap-4 overflow-x-auto pb-2 text-sm text-ink-muted md:hidden">
        <Link href="/marketplace" className="whitespace-nowrap hover:text-ink">Marketplace</Link>
        <Link href="/vendors" className="whitespace-nowrap hover:text-ink">Vendors</Link>
        <Link href="/live-price" className="whitespace-nowrap hover:text-ink">Live Price</Link>
        <Link href="/how-it-works" className="whitespace-nowrap hover:text-ink">How it works</Link>
        <Link href="/trust" className="whitespace-nowrap hover:text-ink">Trust</Link>
      </nav>
    </header>
  );
}

function firstName(full?: string | null): string | null {
  const n = full?.trim().split(/\s+/)[0];
  return n && n.length > 0 ? n : null;
}
