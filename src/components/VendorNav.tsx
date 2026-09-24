"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
const primary = [["/vendor", "Overview", "نظرة عامة"], ["/vendor/orders", "Orders", "الطلبات"], ["/vendor/products", "Products", "المنتجات"], ["/vendor/payments", "Payments & hours", "الدفع والدوام"]] as const;
const secondary = [["/vendor/register", "Store details", "بيانات المتجر"], ["/vendor/requests", "Buyer requests", "طلبات العملاء"], ["/vendor/catalogue-support", "Catalogue help", "مساعدة الكتالوج"], ["/vendor/reviews", "Reviews", "التقييمات"], ["/vendor/documents", "Documents", "المستندات"], ["/profile", "My profile", "ملفي الشخصي"]] as const;
export function VendorNav({ arabic: initialArabic = false }: { arabic?: boolean }) {
  const pathname = usePathname();
  const [arabic, setArabic] = useState(initialArabic);
  useEffect(() => setArabic(document.documentElement.lang === "ar"), []);
  const active = (href: string) => href === "/vendor" ? pathname === href : pathname.startsWith(href);
  const render = ([href, en, ar]: readonly string[]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-semibold transition sm:px-5 ${active(href) ? "bg-jade-900 text-white shadow-sm" : "text-ink-muted hover:bg-jade-50 hover:text-jade-900"}`}>{arabic ? ar : en}</Link>;
  return <nav className="my-6 rounded-2xl border border-jade-900/10 bg-white p-2 shadow-sm" aria-label={arabic ? "إدارة المتجر" : "Vendor workspace"}>
    <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">{primary.map(render)}<details className="col-span-2 sm:ms-auto"><summary className={`flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl px-4 text-sm font-semibold ${secondary.some(([href]) => active(href)) ? "bg-jade-50 text-jade-900" : "text-ink-muted"}`}>{arabic ? "أدوات المتجر والمساعدة" : "Store tools & help"}<span className="ms-2" aria-hidden>⌄</span></summary><div className="flex flex-wrap gap-1 border-t border-bone-deep pt-2">{secondary.map(render)}</div></details></div>
  </nav>;
}
