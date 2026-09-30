import Link from "next/link";
import { cookies } from "next/headers";

export async function SiteFooter() {
  const arabic = (await cookies()).get("gg_lang")?.value === "ar";
  const t = arabic ? {
    description: "سوق إماراتي للذهب والمجوهرات من متاجر موثقة. يحتفظ البائع بالمخزون ويظل مسؤولاً عن البيع.", marketplace: "السوق", browse: "تصفح الكل", vendors: "المتاجر الموثقة", insights: "تحليلات الذهب وتاريخه", compare: "مقارنة المنتجات", trust: "الثقة", verification: "الثقة والتحقق", how: "كيف يعمل", contact: "تواصل معنا", partners: "الشركاء", list: "أضف متجرك", vendor: "لوحة البائع", delivery: "انضم كشركة توصيل", deliveryDash: "لوحة التوصيل", policies: "السياسات", terms: "الشروط", privacy: "الخصوصية", deliveryPolicy: "التوصيل والاستلام", refunds: "الإلغاء والاسترداد", sold: "المنتجات تباع من المتاجر المدرجة.", disclaimer: "قد تتغير أسعار الذهب. المقارنات ليست نصيحة مالية.",
  } : { description: "A marketplace of verified UAE jewellers. Vendors own the inventory and remain the seller of record.", marketplace: "Marketplace", browse: "Browse all", vendors: "Verified vendors", insights: "Gold insights & history", compare: "Compare listings", trust: "Trust", verification: "Trust & verification", how: "How it works", contact: "Contact us", partners: "Partners", list: "List your shop", vendor: "Vendor dashboard", delivery: "Join as delivery company", deliveryDash: "Delivery dashboard", policies: "Policies", terms: "Terms", privacy: "Privacy", deliveryPolicy: "Delivery & collection", refunds: "Cancellations & refunds", sold: "Products are sold by listed vendors.", disclaimer: "Gold prices can move. Marketplace comparisons are not financial advice." };
  return (
    <footer className="border-t border-bone-deep/60 bg-[#f4f0e9] text-ink">
      <div className="container-pro grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="flex items-center gap-2.5">
                        <span className="font-serif text-2xl tracking-tight">GET GOLD</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
            {t.description}
          </p>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">{t.marketplace}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/marketplace">{t.browse}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/vendors">{t.vendors}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/live-price">{t.insights}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/compare">{t.compare}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">{t.trust}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/trust">{t.verification}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/how-it-works">{t.how}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/contact">{t.contact}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">{t.partners}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/vendor/register">{t.list}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/login?role=vendor&next=/vendor">{t.vendor}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/delivery/register">{t.delivery}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/delivery">{t.deliveryDash}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="eyebrow text-gold-600">{t.policies}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li><Link className="transition hover:text-jade-700" href="/terms">{t.terms}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/privacy">{t.privacy}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/delivery-and-collection">{t.deliveryPolicy}</Link></li>
            <li><Link className="transition hover:text-jade-700" href="/cancellations-and-refunds">{t.refunds}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-bone-deep/60">
        <div className="container-pro flex flex-col gap-2 py-4 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Get Gold. {t.sold}</span>
          <span>{t.disclaimer}</span>
        </div>
      </div>
    </footer>
  );
}
