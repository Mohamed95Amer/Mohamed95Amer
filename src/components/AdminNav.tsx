"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function AdminNav() {
  const pathname = usePathname();
  const [arabic, setArabic] = useState(false);
  useEffect(() => setArabic(document.cookie.split(";").some((part) => part.trim() === "gg_lang=ar")), []);
  const items = [
    ["/admin", "Overview"],
    ["/admin/vendors", "Vendors"],
    ["/admin/delivery-companies", "Delivery companies"],
    ["/admin/products", "Products"],
    ["/admin/catalogue-support", "Catalogue support"],
    ["/admin/liquidity", "Marketplace health"],
    ["/admin/growth", "Growth funnel"],
    ["/admin/marketing", "Promotions & banners"],
    ["/admin/orders", "Orders"],
    ["/admin/reviews", "Reviews"],
    ["/admin/gold-price", "Gold price"],
    ["/admin/audit", "Audit logs"],
    ["/admin/settings", "Settings"],
    ["/profile", "My profile"],
  ] as const;
  const labels = arabic ? ["نظرة عامة", "المتاجر", "شركات التوصيل", "المنتجات", "دعم الكتالوج", "صحة السوق", "مسار النمو", "العروض والإعلانات", "الطلبات", "التقييمات", "سعر الذهب", "سجل التدقيق", "الإعدادات", "ملفي"] : items.map(([, label]) => label);
  return (
    <nav className="card flex gap-1 overflow-x-auto p-1.5" aria-label="Administration">
      {items.map(([href, label], index) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center rounded-xl px-3.5 text-sm font-semibold transition ${active ? "bg-jade-800 text-white" : "text-ink-muted hover:bg-jade-50 hover:text-jade-900"}`}>
            {labels[index] ?? label}
          </Link>
        );
      })}
    </nav>
  );
}
