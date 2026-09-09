import Link from "next/link";
import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  return (
    <footer className="bg-jade-950 text-white">
      <div className="container-pro grid gap-8 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BrandMark inverse />
            <span className="font-serif text-xl font-semibold">GoldHub</span>
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
            <li><Link className="transition hover:text-white" href="/live-price">Live gold price</Link></li>
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
          <h4 className="eyebrow text-gold-200">For vendors</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-white/60">
            <li><Link className="transition hover:text-white" href="/vendor/register">List your shop</Link></li>
            <li><Link className="transition hover:text-white" href="/vendor">Vendor dashboard</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-pro py-4 text-xs text-white/45">
          © {new Date().getFullYear()} GoldHub. GoldHub is a marketplace; products are sold by listed vendors.
        </div>
      </div>
    </footer>
  );
}
