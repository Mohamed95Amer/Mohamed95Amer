import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-bone-deep bg-bone-soft">
      <div className="container-pro grid gap-8 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-6 w-6 rounded-full bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600" />
            <span className="font-serif text-lg">GoldHub</span>
          </div>
          <p className="mt-3 text-sm text-ink-muted max-w-xs">
            A marketplace of verified UAE jewellers. Vendors own the inventory and remain the seller of record.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">Marketplace</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li><Link href="/marketplace">Browse all</Link></li>
            <li><Link href="/vendors">Verified vendors</Link></li>
            <li><Link href="/live-price">Live gold price</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">Trust</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li><Link href="/trust">Trust & verification</Link></li>
            <li><Link href="/how-it-works">How it works</Link></li>
            <li><Link href="/contact">Contact us</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">For vendors</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li><Link href="/vendor/register">List your shop</Link></li>
            <li><Link href="/vendor">Vendor dashboard</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-bone-deep">
        <div className="container-pro py-4 text-xs text-ink-muted">
          © {new Date().getFullYear()} GoldHub. GoldHub is a marketplace; products are sold by listed vendors.
        </div>
      </div>
    </footer>
  );
}
