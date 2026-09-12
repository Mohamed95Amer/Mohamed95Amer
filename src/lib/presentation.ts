const STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  draft: "Draft",
  pending_approval: "Pending approval",
  pending_vendor_confirmation: "Awaiting vendor",
  payment_link_pending: "Payment link pending",
  payment_pending: "Payment pending",
  paid: "Purchased",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
  rejected_by_vendor: "Vendor declined",
  published: "Published",
  hidden: "Hidden",
};

export function statusLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return STATUS_LABELS[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDubaiDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function shortId(value: string | null | undefined): string {
  return value ? `${value.slice(0, 8)}…` : "—";
}
