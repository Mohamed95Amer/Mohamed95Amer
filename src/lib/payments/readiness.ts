/**
 * Online payment remains a visible checkout choice, but it must fail closed
 * until a real PSP adapter, webhook verification and split settlement have
 * been implemented. A database flag alone must never make money collection
 * look operational.
 */
export function onlinePaymentCheckoutIsOperational(): boolean {
  return false;
}
