import { z } from "zod";

export const createReservationSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
});

export const vendorOnboardingSchema = z.object({
  business_name: z.string().min(2).max(200),
  trade_license_number: z.string().min(3).max(60),
  license_expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  owner_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  emirate: z.enum([
    "Abu Dhabi",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Umm Al Quwain",
    "Ras Al Khaimah",
    "Fujairah",
  ]),
  store_address: z.string().min(5).max(500),
  google_maps_link: z.string().url().optional().nullable(),
  vat_trn_number: z.string().max(20).optional().nullable(),
});

export const productUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum([
    "ring", "necklace", "bracelet", "earring", "bangle", "chain", "pendant", "bar", "coin", "other",
  ]),
  karat: z.union([z.literal(18), z.literal(21), z.literal(22), z.literal(24)]),
  weight_grams: z.number().positive().max(10000),
  making_charge: z.number().min(0).max(1_000_000),
  making_charge_discount_percent: z.number().int().min(0).max(100),
  making_charge_offer_ends_at: z.string().datetime({ offset: true }).nullable(),
  certificate_fee: z.number().min(0).max(1_000_000),
  stone_value: z.number().min(0).max(10_000_000),
  vendor_premium: z.number().min(0).max(1_000_000),
  quantity: z.number().int().min(0).max(100000),
  images: z.array(z.string()).max(20).default([]),
  certificate_number: z.string().max(120).optional().nullable(),
  hallmark_info: z.string().max(200).optional().nullable(),
  submit_for_approval: z.boolean().optional().default(false),
}).superRefine((product, ctx) => {
  if (product.making_charge_discount_percent > 0 && product.making_charge <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["making_charge_discount_percent"],
      message: "A making-charge discount requires a making charge above zero",
    });
  }
  if (product.making_charge_offer_ends_at && product.making_charge_discount_percent === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["making_charge_offer_ends_at"],
      message: "Set a making-charge discount before scheduling an end time",
    });
  }
});

export const deliveryCompanyOnboardingSchema = z.object({
  company_name: z.string().trim().min(2).max(200),
  trade_license_number: z.string().trim().min(3).max(60),
  license_expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  contact_name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(20),
  emirates_served: z.array(z.enum([
    "Abu Dhabi",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Umm Al Quwain",
    "Ras Al Khaimah",
    "Fujairah",
  ])).min(1).max(7),
  service_notes: z.string().trim().max(1000).optional().nullable(),
  website: z.string().url().optional().nullable(),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
});

export const vendorResponseSchema = z.object({
  reservationId: z.string().uuid(),
  decision: z.enum(["confirm", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

export const adminVendorDecisionSchema = z.object({
  vendorId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "suspend"]),
  note: z.string().max(500).optional().nullable(),
});

export const adminProductDecisionSchema = z.object({
  productId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "suspend"]),
  note: z.string().max(500).optional().nullable(),
});

export const platformSettingsSchema = z.object({
  platform_fee_bps: z.number().int().min(0).max(1000),
  delivery_fee_aed: z.number().min(0).max(100000),
  reservation_lock_minutes: z.number().int().min(1).max(60),
  stale_price_seconds: z.number().int().min(15).max(600),
});

export const adminDeliveryCompanyDecisionSchema = z.object({
  deliveryCompanyId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "suspend"]),
  note: z.string().max(500).optional().nullable(),
});

const rating = z.number().int().min(1).max(5);

export const reviewUpsertSchema = z.object({
  reservationId: z.string().uuid(),
  overallRating: rating,
  productRating: rating,
  communicationRating: rating,
  fulfilmentRating: rating,
  packagingRating: rating,
  deliveryRating: rating.nullable(),
  title: z.string().trim().min(2).max(120).optional().nullable(),
  comment: z.string().trim().min(10).max(2000).optional().nullable(),
});

export const reviewReportSchema = z.object({
  reason: z.enum(["spam", "fake_or_misleading", "abusive", "personal_information", "other"]),
  details: z.string().trim().max(1000).optional().nullable(),
});

export const vendorReviewReplySchema = z.object({
  reply: z.string().trim().min(2).max(1000),
});

export const adminReviewModerationSchema = z.object({
  action: z.enum([
    "publish_review",
    "hide_review",
    "publish_reply",
    "hide_reply",
    "dismiss_report",
    "action_report",
  ]),
  reportId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});
