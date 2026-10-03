const STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  draft: "Draft",
  pending_approval: "Pending approval",
  pending_vendor_confirmation: "Awaiting vendor",
  vendor_confirmed: "Awaiting your acceptance",
  payment_link_pending: "Payment link pending",
  payment_pending: "Payment pending",
  payment_verification: "Payment verification",
  payment_confirmed: "Payment confirmed",
  preparing_order: "Preparing order",
  ready_for_delivery: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
  paid: "Purchased",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
  rejected_by_vendor: "Vendor declined",
  published: "Published",
  hidden: "Hidden",
};

const STATUS_LABELS_AR: Record<string, string> = {
  pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض", suspended: "موقوف",
  draft: "مسودة", pending_approval: "بانتظار الموافقة", pending_vendor_confirmation: "بانتظار تأكيد المتجر",
  vendor_confirmed: "بانتظار قبولك", payment_link_pending: "بانتظار رابط الدفع",
  payment_pending: "بانتظار الدفع", payment_verification: "التحقق من الدفع", payment_confirmed: "تم تأكيد الدفع",
  preparing_order: "تجهيز الطلب", ready_for_delivery: "جاهز للتوصيل", out_for_delivery: "خرج للتوصيل",
  delivered: "تم التوصيل", completed: "مكتمل", paid: "تم الشراء", cancelled: "ملغى",
  expired: "منتهي الصلاحية", refunded: "تم رد المبلغ", rejected_by_vendor: "رفض المتجر الطلب",
  published: "منشور", hidden: "مخفي",
};

export function statusLabel(value: string | null | undefined, arabic = false): string {
  if (!value) return arabic ? "غير معروف" : "Unknown";
  if (arabic) return STATUS_LABELS_AR[value] ?? "حالة غير معروفة";
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
