export default function TrustPage() {
  const items = [
    ["Verified vendors", "Every shop submits trade license, owner ID, store address, and contact details. We manually approve."],
    ["Document checks", "Trade license expiry, VAT TRN, Emirates ID/passport, and store photos are reviewed by admins."],
    ["Hallmark & certificate", "Listings include hallmark info and certificate number where applicable, visible on every product page."],
    ["Transparent price calculation", "We show every component: gold value, making charge, stone value, vendor premium, platform fee, delivery."],
    ["Secure reservation", "Prices are computed server-side at reservation. A snapshot of the exact gold tick used is stored with the order."],
    ["Admin-approved listings", "Vendors cannot publish a product without admin approval — and a vendor cannot self-approve their account."],
    ["Future: insured delivery & payments", "We're integrating insured logistics and regulated payment partners — coming soon."],
  ];
  return (
    <div className="container-pro py-12">
      <h1 className="font-serif text-4xl">Trust & verification</h1>
      <p className="text-ink-muted mt-2 max-w-2xl">
        Buying gold should be transparent. Here&apos;s how we keep it that way.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {items.map(([t, d]) => (
          <div key={t} className="card p-6">
            <h2 className="font-serif text-xl">{t}</h2>
            <p className="text-sm text-ink-muted mt-1">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
