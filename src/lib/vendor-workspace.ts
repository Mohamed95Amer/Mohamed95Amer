import { statusLabel } from "@/lib/presentation";

export type VendorOrderGroup = "requests" | "payments" | "fulfilment" | "waiting" | "history";
type OrderTiming = { status: string; expires_at?: string | null; vendor_action_available_at?: string | null; payment_method?: string | null };
const EXPIRING = ["pending_vendor_confirmation", "vendor_confirmed", "payment_pending", "payment_link_pending"];
export function vendorOrderStatus(order: OrderTiming, now = Date.now()): string {
  return EXPIRING.includes(order.status) && order.expires_at && Date.parse(order.expires_at) <= now ? "expired" : order.status;
}
export function vendorOrderGroup(order: OrderTiming, now = Date.now()): VendorOrderGroup {
  const status = vendorOrderStatus(order, now);
  if (status === "pending_vendor_confirmation") return order.vendor_action_available_at && Date.parse(order.vendor_action_available_at) > now ? "waiting" : "requests";
  if (status === "payment_verification" || (status === "payment_pending" && ["cash", "card", "pay_at_store"].includes(order.payment_method ?? ""))) return "payments";
  if (["payment_confirmed", "preparing_order", "ready_for_delivery", "out_for_delivery", "delivered"].includes(status)) return "fulfilment";
  if (["vendor_confirmed", "payment_pending", "payment_link_pending"].includes(status)) return "waiting";
  return "history";
}
export function vendorStatus(value: string, arabic = false): string {
  const ar: Record<string, string> = { approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض", suspended: "موقوف", draft: "مسودة", pending_approval: "بانتظار الموافقة", pending_vendor_confirmation: "بانتظار تأكيدك", vendor_confirmed: "بانتظار موافقة العميل", payment_pending: "بانتظار الدفع", payment_verification: "تحقق من استلام المبلغ", payment_confirmed: "تم تأكيد الدفع", preparing_order: "قيد التجهيز", ready_for_delivery: "جاهز", out_for_delivery: "في الطريق", delivered: "تم التسليم", completed: "مكتمل", paid: "تم الشراء", cancelled: "ملغى", expired: "انتهت المهلة", refunded: "تم الاسترداد", rejected_by_vendor: "تم رفض الطلب" };
  if (!arabic && value === "vendor_confirmed") return "Awaiting customer acceptance";
  if (!arabic && value === "pending_vendor_confirmation") return "Needs your confirmation";
  return arabic ? ar[value] ?? statusLabel(value) : statusLabel(value);
}
export function vendorDate(value: string | null | undefined, arabic = false): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat(arabic ? "ar-AE" : "en-AE", { timeZone: "Asia/Dubai", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
export const vendorCategories = [
  ["ring", "Rings", "خواتم"], ["necklace", "Necklaces", "قلائد"], ["bracelet", "Bracelets", "أساور"], ["earring", "Earrings", "أقراط"], ["bangle", "Bangles", "أساور صلبة"], ["chain", "Chains", "سلاسل"], ["pendant", "Pendants", "تعليقات"], ["bar", "Gold bars", "سبائك"], ["coin", "Gold coins", "عملات ذهبية"], ["other", "Other", "أخرى"],
] as const;
