"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  ["/vendor", "Overview"],
  ["/vendor/products", "Products"],
  ["/vendor/orders", "Orders"],
  ["/vendor/payments", "Payments"],
  ["/vendor/requests", "Buyer requests"],
  ["/vendor/catalogue-support", "Catalogue help"],
  ["/vendor/reviews", "Reviews"],
  ["/vendor/documents", "Documents"],
  ["/profile", "My profile"],
] as const;

export function VendorNav() {
  const pathname = usePathname();
  const [arabic, setArabic] = useState(false);
  useEffect(() => setArabic(document.cookie.split(";").some((part) => part.trim() === "gg_lang=ar")), []);
  const labels = arabic ? ["نظرة عامة", "المنتجات", "الطلبات", "المدفوعات", "طلبات العملاء", "مساعدة الكتالوج", "التقييمات", "المستندات", "ملفي"] : items.map(([, label]) => label);
  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-jade-900/10 bg-white p-1.5 shadow-sm" aria-label="Vendor area">
      {items.map(([href, label], index) => {
        const active = href === "/vendor" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center rounded-xl px-4 text-sm font-semibold transition ${active ? "bg-jade-800 text-white" : "text-ink-muted hover:bg-jade-50 hover:text-jade-900"}`}>{labels[index] ?? label}</Link>;
      })}
    </nav>
  );
}
