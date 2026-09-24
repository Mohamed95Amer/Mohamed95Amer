"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AdminNav({ arabic = false }: { arabic?: boolean }) {
  const pathname = usePathname();
  const primary = [
    ["/admin", "Overview", "نظرة عامة"],
    ["/admin/orders", "Orders", "الطلبات"],
    ["/admin/vendors", "Stores", "المتاجر"],
    ["/admin/products", "Products", "المنتجات"],
    ["/admin/commissions", "Commissions", "الرسوم"],
    ["/admin/notifications", "Notifications", "الإشعارات"],
  ];
  const more = [
    ["/admin/marketing", "Promotions & banners", "العروض والإعلانات"],
    ["/admin/delivery-companies", "Delivery partners", "شركاء التوصيل"],
    ["/admin/catalogue-support", "Catalogue support", "دعم الكتالوج"],
    ["/admin/liquidity", "Marketplace health", "صحة السوق"],
    ["/admin/growth", "Growth funnel", "مسار النمو"],
    ["/admin/reviews", "Reviews", "التقييمات"],
    ["/admin/gold-price", "Gold price", "سعر الذهب"],
    ["/admin/audit", "Audit logs", "سجل التدقيق"],
    ["/admin/settings", "Settings", "الإعدادات"],
    ["/profile", "My profile", "ملفي"],
  ];
  const active = (href: string) =>
    href === "/admin" ? pathname === href : pathname.startsWith(href);
  const link = ([href, en, ar]: string[]) => (
    <Link
      key={href}
      href={href}
      aria-current={active(href) ? "page" : undefined}
      className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium transition ${active(href) ? "bg-jade-800 text-white" : "text-ink-muted hover:bg-jade-50 hover:text-jade-950"}`}
    >
      {arabic ? ar : en}
    </Link>
  );
  return (
    <nav
      aria-label={arabic ? "الإدارة" : "Administration"}
      className="card p-2"
    >
      <div className="grid grid-cols-3 gap-1 lg:grid-cols-6">
        {primary.map(link)}
      </div>
      <details
        className="mt-1 border-t border-bone-deep pt-1"
        open={more.some(([href]) => active(href)) || undefined}
      >
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-jade-700">
          {arabic ? "المزيد من الأدوات والإعدادات" : "More tools & settings"}
        </summary>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
          {more.map(link)}
        </div>
      </details>
    </nav>
  );
}
