export default function HowItWorksPage() {
  const steps = [
    [
      "Vendors verify",
      "Every gold shop submits trade license, owner ID, and store details. Admins manually approve before the shop can list products.",
    ],
    [
      "Products are reviewed",
      "Each listing is reviewed for weight, karat, hallmark, and certificate information before going live.",
    ],
    [
      "Prices update live",
      "We fetch the 24K spot price every 15–30 seconds, convert to AED per gram, and recompute product prices using the configured formula.",
    ],
    [
      "Reserve at the live price",
      "When you reserve, the server recomputes the official price and snapshots every component. The price is locked for 10 minutes.",
    ],
    [
      "Vendor confirms",
      "The vendor confirms availability. You receive a payment link from the vendor or pick up at the shop.",
    ],
  ];
  return (
    <div className="container-pro py-12">
      <h1 className="font-serif text-4xl">How it works</h1>
      <p className="text-ink-muted mt-2 max-w-2xl">
        GoldHub is a marketplace, not a seller. Verified vendors own the inventory and remain
        the seller of record. Here is what happens behind the scenes.
      </p>
      <ol className="mt-10 space-y-6">
        {steps.map(([title, body], i) => (
          <li key={title} className="card p-6">
            <div className="flex items-start gap-4">
              <span className="font-serif text-2xl text-gold-500">{i + 1}</span>
              <div>
                <h2 className="font-serif text-xl">{title}</h2>
                <p className="mt-1 text-ink-muted">{body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
