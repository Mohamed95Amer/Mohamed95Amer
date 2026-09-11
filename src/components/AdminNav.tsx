import Link from "next/link";

export function AdminNav() {
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
    <nav className="card p-2 flex flex-wrap gap-1">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-bone hover:text-ink">
          {label}
        </Link>
      ))}
    </nav>
  );
}
