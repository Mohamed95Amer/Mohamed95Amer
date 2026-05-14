import Link from "next/link";
import { GoldPriceBadge } from "./GoldPriceBadge";

export function SiteHeader() {
  return (
    <header className="border-b border-bone-deep bg-bone-soft/80 backdrop-blur sticky top-0 z-30">
      <div className="container-pro flex items-center justify-between py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-7 w-7 rounded-full bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600" />
          <span className="font-serif text-xl tracking-tight">GoldHub</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-ink-muted">
          <Link href="/marketplace" className="hover:text-ink">Marketplace</Link>
          <Link href="/vendors" className="hover:text-ink">Vendors</Link>
          <Link href="/live-price" className="hover:text-ink">Live Price</Link>
          <Link href="/how-it-works" className="hover:text-ink">How it works</Link>
          <Link href="/trust" className="hover:text-ink">Trust</Link>
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block"><GoldPriceBadge compact /></div>
          <Link href="/login" className="btn-ghost text-xs">Sign in</Link>
        </div>
      </div>
    </header>
  );
}
