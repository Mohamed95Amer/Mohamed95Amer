import {
  deliveryPinUrl,
  formatDeliveryAddress,
  fulfilmentLabel,
  type FulfilmentDetails as FulfilmentDetailsValue,
} from "@/lib/fulfilment";

export function FulfilmentDetails({
  details,
  compact = false,
}: {
  details: FulfilmentDetailsValue;
  compact?: boolean;
}) {
  const isDelivery = details.fulfilment_method === "delivery";
  const address = formatDeliveryAddress(details);
  const pinUrl = deliveryPinUrl(details);

  return (
    <div className={compact ? "text-xs" : "card p-6 sm:p-7"}>
      {!compact && <p className="eyebrow text-jade-600">Fulfilment</p>}
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "" : "mt-1"}`}>
        <h2 className={compact ? "font-semibold text-jade-950" : "font-serif text-2xl font-semibold text-jade-950"}>
          {fulfilmentLabel(details.fulfilment_method)}
        </h2>
        <span className="pill border-jade-900/10 bg-white text-jade-700">{isDelivery ? "Pinned address" : "Arrange with store"}</span>
      </div>

      {isDelivery ? (
        <div className={`${compact ? "mt-2 grid gap-2 sm:grid-cols-3" : "mt-5 grid gap-4 sm:grid-cols-2"}`}>
          <div>
            <p className="label">Recipient</p>
            <p className="mt-1 font-medium text-jade-950">{details.recipient_name || "—"}</p>
            {details.recipient_phone && <a className="mt-0.5 block font-semibold text-jade-700 hover:text-jade-500" href={`tel:${details.recipient_phone}`}>{details.recipient_phone}</a>}
          </div>
          <div>
            <p className="label">Address</p>
            <p className="mt-1 leading-relaxed text-jade-950">{address.length ? address.join(", ") : "—"}</p>
            {details.delivery_landmark && <p className="mt-0.5 text-ink-muted">Near {details.delivery_landmark}</p>}
          </div>
          <div className={compact ? "" : "sm:col-span-2"}>
            {pinUrl && <a href={pinUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-full border border-jade-700/20 bg-jade-50 px-3 font-semibold text-jade-700 hover:bg-jade-100">⌖ Open delivery pin ↗</a>}
          </div>
        </div>
      ) : (
        <p className={`leading-relaxed text-ink-muted ${compact ? "mt-1" : "mt-3"}`}>The customer will arrange collection directly with the store after confirmation.</p>
      )}

      {details.customer_note && (
        <div className={`${compact ? "mt-2" : "mt-5 border-t border-jade-900/10 pt-4"}`}>
          <p className="label">Customer note</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-ink-muted">{details.customer_note}</p>
        </div>
      )}
    </div>
  );
}
