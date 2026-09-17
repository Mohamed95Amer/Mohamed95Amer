import type { CustomerFeeOffer } from "@/lib/pricing/customer-fee";

export function ActiveOfferNotice({ offer }: { offer: CustomerFeeOffer }) {
  if (!offer.eventPromotionTitle) return null;
  const details = [
    offer.eventDiscountPercent > 0 ? `${offer.eventDiscountPercent}% off the Get Gold fee` : null,
    offer.eventDeliveryDiscountPercent === 100 ? "free delivery" : offer.eventDeliveryDiscountPercent > 0 ? `${offer.eventDeliveryDiscountPercent}% off delivery` : null,
  ].filter(Boolean).join(" · ");
  return <div className="rounded-2xl border border-gold-300/50 bg-gold-50 px-5 py-4 text-jade-950 shadow-sm">
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-gold-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">Limited offer</span><strong>{offer.eventPromotionTitle}</strong></div>
    <p className="mt-1 text-sm text-ink-muted">{details}{offer.eventPromotionEndsAt ? ` · ends ${new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric" }).format(new Date(offer.eventPromotionEndsAt))}` : ""}</p>
  </div>;
}
