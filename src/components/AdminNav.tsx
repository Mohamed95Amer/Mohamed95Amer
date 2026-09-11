"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav() {
  const pathname = usePathname();
  const items = [
    ["/admin", "Overview"],
    ["/admin/vendors", "Vendors"],
    ["/admin/products", "Products"],
    ["/admin/orders", "Orders"],
    ["/admin/reviews", "Reviews"],
    ["/admin/gold-price", "Gold price"],
    ["/admin/audit", "Audit logs"],
    ["/admin/settings", "Settings"],
  ] as const;
  return (
    <nav className="card flex gap-1 overflow-x-auto p-1.5" aria-label="Administration">
      {items.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center rounded-xl px-3.5 text-sm font-semibold transition ${active ? "bg-jade-800 text-white" : "text-ink-muted hover:bg-jade-50 hover:text-jade-900"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
