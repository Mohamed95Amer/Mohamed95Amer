import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-bone-deep/60 bg-[#f4f0e9] text-ink">
      <div className="container-pro grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="flex items-center gap-2.5">
                        <span className="font-serif text-2xl tracking-tight">GET GOLD</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
            A marketplace of verified UAE jewellers. Vendors own the inventory and remain the seller of record.
          </p>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">Marketplace</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/marketplace">Browse all</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/vendors">Verified vendors</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/live-price">Gold insights & history</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/compare">Compare listings</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">Trust</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/trust">Trust & verification</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/how-it-works">How it works</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/contact">Contact us</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">Partners</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/vendor/register">List your shop</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/login?role=vendor&next=/vendor">Vendor dashboard</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/delivery/register">Join as delivery company</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/delivery">Delivery dashboard</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">Policies</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/terms">Terms</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/privacy">Privacy</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/delivery-and-collection">Delivery & collection</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/cancellations-and-refunds">Cancellations & refunds</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-bone-deep/60">
        <div className="container-pro flex flex-col gap-2 py-4 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Get Gold. Products are sold by listed vendors.</span>
          <span>Gold prices can move. Marketplace comparisons are not financial advice.</span>
        </div>
      </div>
    </footer>
  );
}
