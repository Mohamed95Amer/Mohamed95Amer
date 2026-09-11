import Link from "next/link";
import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  return (
    <footer className="bg-jade-950 text-white">
      <div className="container-pro grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="flex items-center gap-2.5">
            <BrandMark inverse />
            <span className="font-serif text-xl font-semibold">Get Gold</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
            A marketplace of verified UAE jewellers. Vendors own the inventory and remain the seller of record.
          </p>
        </div>
        <div>
          <h4 className="eyebrow text-gold-200">Marketplace</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            <li><Link className="transition hover:text-white" href="/marketplace">Browse all</Link></li>
            <li><Link className="transition hover:text-white" href="/vendors">Verified vendors</Link></li>
            <li><Link className="transition hover:text-white" href="/live-price">Gold insights & history</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-200">Trust</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            <li><Link className="transition hover:text-white" href="/trust">Trust & verification</Link></li>
            <li><Link className="transition hover:text-white" href="/how-it-works">How it works</Link></li>
            <li><Link className="transition hover:text-white" href="/contact">Contact us</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-200">Partners</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            <li><Link className="transition hover:text-white" href="/vendor/register">List your shop</Link></li>
            <li><Link className="transition hover:text-white" href="/vendor">Vendor dashboard</Link></li>
            <li><Link className="transition hover:text-white" href="/delivery/register">Join as delivery company</Link></li>
            <li><Link className="transition hover:text-white" href="/delivery">Delivery dashboard</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-200">Policies</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            <li><Link className="transition hover:text-white" href="/terms">Terms</Link></li>
            <li><Link className="transition hover:text-white" href="/privacy">Privacy</Link></li>
            <li><Link className="transition hover:text-white" href="/delivery-and-collection">Delivery & collection</Link></li>
            <li><Link className="transition hover:text-white" href="/cancellations-and-refunds">Cancellations & refunds</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-pro flex flex-col gap-2 py-4 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Get Gold. Products are sold by listed vendors.</span>
          <span>Gold prices can move. Marketplace comparisons are not financial advice.</span>
        </div>
      </div>
    </footer>
  );
}
