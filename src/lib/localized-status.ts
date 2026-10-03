import { statusLabel } from "@/lib/presentation";

const arabicStatus: Record<string, string> = {
  pending: "قيد المراجعة",
  pending_approval: "بانتظار الموافقة",
  approved: "معتمد",
  rejected: "مرفوض",
  suspended: "موقوف",
  draft: "مسودة",
  active: "نشط",
  inactive: "غير نشط",
  cancelled: "ملغى",
  expired: "منتهي",
  completed: "مكتمل",
  open: "مفتوح",
  closed: "مغلق",
  published: "منشور",
  hidden: "مخفي",
  flagged: "معلّم للمراجعة",
  reported: "مبلّغ عنه",
  pending_vendor_confirmation: "بانتظار تأكيد المتجر",
  vendor_confirmed: "أكد المتجر السعر",
  payment_pending: "بانتظار الدفع",
  payment_verification: "مراجعة الدفع",
  payment_confirmed: "تم تأكيد الدفع",
  preparing_order: "جارٍ تجهيز الطلب",
  ready_for_delivery: "جاهز للتوصيل",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التسليم",
  purchased: "تم الشراء",
  refunded: "مسترد",
  disputed: "عليه نزاع",
  not_required: "غير مطلوب",
  system: "النظام",
  admin: "مسؤول",
  super_admin: "مالك المنصة",
  vendor: "متجر",
  customer: "عميل",
  delivery_company: "شركة توصيل",
};

export function localizedStatusLabel(value: string | null | undefined, arabic: boolean): string {
  const status = value ?? "";
  return arabic ? arabicStatus[status] ?? statusLabel(status) : statusLabel(status);
}
