import { z } from "zod";
import { isAcceptedDeliveryMapLink, UAE_EMIRATES } from "@/lib/fulfilment";
import { isSecureExternalPaymentUrl } from "@/lib/order-messages";

const optionalTrimmed = (maximum: number) =>
  z.string().trim().max(maximum).optional().nullable();
const optionalMapLink = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .url()
    .max(1000)
    .refine(
      isAcceptedDeliveryMapLink,
      "Use a secure Google Maps or Apple Maps link",
    )
    .optional()
    .nullable(),
);

export const createReservationSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    identityVerificationId: z.string().uuid(),
    paymentMethod: z.enum([
      "pay_at_store",
      "pay_online",
      "bank_transfer",
      "aani",
      "cash",
      "card",
    ]),
    fulfilmentMethod: z.enum(["delivery", "collection"]),
    recipientName: optionalTrimmed(120),
    recipientPhone: optionalTrimmed(20),
    deliveryEmirate: z.preprocess(
      (value) => (value === "" ? null : value),
      z.enum(UAE_EMIRATES).optional().nullable(),
    ),
    deliveryArea: optionalTrimmed(120),
    deliveryAddressLine1: optionalTrimmed(240),
    deliveryAddressLine2: optionalTrimmed(240),
    deliveryLandmark: optionalTrimmed(240),
    deliveryLatitude: z.number().min(-90).max(90).optional().nullable(),
    deliveryLongitude: z.number().min(-180).max(180).optional().nullable(),
    deliveryMapLink: optionalMapLink,
    customerNote: optionalTrimmed(500),
  })
  .superRefine((reservation, ctx) => {
    if (reservation.fulfilmentMethod !== "delivery") return;

    const requiredText: Array<[keyof typeof reservation, string]> = [
      ["recipientName", "Enter the recipient name"],
      ["recipientPhone", "Enter the recipient phone number"],
      ["deliveryEmirate", "Choose an emirate"],
      ["deliveryArea", "Enter the area or neighbourhood"],
      ["deliveryAddressLine1", "Enter the street and building or villa"],
    ];
    for (const [path, message] of requiredText) {
      if (!String(reservation[path] ?? "").trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      }
    }
    if (
      reservation.recipientName &&
      reservation.recipientName.trim().length < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientName"],
        message: "Enter the full recipient name",
      });
    }
    if (
      reservation.recipientPhone &&
      reservation.recipientPhone.trim().length < 7
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientPhone"],
        message: "Enter a valid mobile number",
      });
    }

    const hasCoordinates =
      reservation.deliveryLatitude != null &&
      reservation.deliveryLongitude != null;
    if (!hasCoordinates && !reservation.deliveryMapLink?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryMapLink"],
        message: "Add a location pin using your device or a Maps link",
      });
    }
  });

export const identityVerificationStartSchema = z.object({
  productId: z.string().uuid(),
  verificationRoute: z.enum(["uae_resident", "visitor"]),
});

export const vendorOnboardingSchema = z
  .object({
    business_name: z.string().min(2).max(200),
    trade_license_number: z.string().min(3).max(60),
    license_expiry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
    owner_name: z.string().min(2).max(120),
    contact_first_name: z.string().trim().min(2).max(80).optional(),
    contact_last_name: z.string().trim().min(2).max(80).optional(),
    contact_title: z.string().trim().min(2).max(100).optional(),
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
    store_latitude: z.number().min(-90).max(90).optional().nullable(),
    store_longitude: z.number().min(-180).max(180).optional().nullable(),
    vat_trn_number: z.string().max(20).optional().nullable(),
    number_of_stores: z.number().int().min(1).max(1000).default(1),
    delivery_available: z.boolean().default(false),
    online_payment_available: z.boolean().default(false),
    website_available: z.boolean().default(false),
    website_url: z.string().url().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.website_available && !data.website_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["website_url"],
        message: "Add your website link when website is enabled",
      });
    }
  });

export const productUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(2).max(200),
    description: z.string().max(2000).optional().nullable(),
    category: z.enum([
      "ring",
      "necklace",
      "bracelet",
      "earring",
      "bangle",
      "chain",
      "pendant",
      "bar",
      "coin",
      "other",
    ]),
    karat: z.union([
      z.literal(12),
      z.literal(14),
      z.literal(16),
      z.literal(18),
      z.literal(21),
      z.literal(22),
      z.literal(24),
    ]),
    weight_grams: z.number().positive().max(10000),
    making_charge: z.number().min(0).max(1_000_000),
    making_charge_discount_percent: z.number().int().min(0).max(100),
    making_charge_offer_ends_at: z
      .string()
      .datetime({ offset: true })
      .nullable(),
    certificate_fee: z.number().min(0).max(1_000_000),
    stone_value: z.number().min(0).max(10_000_000),
    vendor_premium: z.literal(0).default(0),
    vendor_rate_adjustment_per_gram: z.number().min(0).max(1000).default(0),
    assay_fineness: z
      .number()
      .min(500)
      .max(1000)
      .refine(
        (value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6,
        "Use one decimal place or less",
      )
      .nullable()
      .default(null),
    vat_rate_bps: z.union([z.literal(0), z.literal(500)]),
    vat_choice_confirmed: z.boolean().default(false),
    quantity: z.number().int().min(0).max(100000),
    images: z.array(z.string()).max(20).default([]),
    certificate_number: z.string().max(120).optional().nullable(),
    hallmark_info: z.string().max(200).optional().nullable(),
    submit_for_approval: z.boolean().optional().default(false),
  })
  .superRefine((product, ctx) => {
    if (product.vat_rate_bps === 0 && !product.vat_choice_confirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vat_choice_confirmed"],
        message:
          "Confirm that not charging VAT is appropriate for this product and your business",
      });
    }
    if (
      product.making_charge_discount_percent > 0 &&
      product.making_charge <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["making_charge_discount_percent"],
        message: "A making-charge discount requires a making charge above zero",
      });
    }
    if (
      product.making_charge_offer_ends_at &&
      product.making_charge_discount_percent === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["making_charge_offer_ends_at"],
        message: "Set a making-charge discount before scheduling an end time",
      });
    }
    if (
      product.assay_fineness !== null &&
      !["bar", "coin"].includes(product.category)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assay_fineness"],
        message:
          "Exact assay fineness is for bullion bars or coins; use the karat field for jewellery",
      });
    }
  });

export const deliveryCompanyOnboardingSchema = z.object({
  company_name: z.string().trim().min(2).max(200),
  trade_license_number: z.string().trim().min(3).max(60),
  license_expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  contact_name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(20),
  emirates_served: z
    .array(
      z.enum([
        "Abu Dhabi",
        "Dubai",
        "Sharjah",
        "Ajman",
        "Umm Al Quwain",
        "Ras Al Khaimah",
        "Fujairah",
      ]),
    )
    .min(1)
    .max(7),
  service_notes: z.string().trim().max(1000).optional().nullable(),
  website: z.string().url().optional().nullable(),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
});

export const vendorResponseSchema = z
  .object({
    reservationId: z.string().uuid(),
    decision: z.enum(["confirm", "reject"]),
    finalTotalAed: z.number().positive().max(100_000_000).optional(),
    note: z.string().max(500).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "confirm" && value.finalTotalAed == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finalTotalAed"],
        message: "Confirm the final customer total.",
      });
    }
  });

export const customerConfirmedPriceSchema = z.object({
  reservationId: z.string().uuid(),
  action: z.enum(["accept", "cancel"]),
});

export const orderMessageSchema = z
  .object({
    reservationId: z.string().uuid(),
    messageType: z.enum(["text", "payment_link"]).default("text"),
    body: z.string().trim().min(1).max(2000),
    paymentUrl: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.messageType === "payment_link" && !value.paymentUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentUrl"],
        message: "Add the secure payment link.",
      });
    }
    if (value.paymentUrl && !isSecureExternalPaymentUrl(value.paymentUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentUrl"],
        message:
          "Use a public HTTPS payment link without embedded credentials.",
      });
    }
    if (value.messageType === "text" && value.paymentUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentUrl"],
        message: "Payment URLs require a payment-link message.",
      });
    }
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
  listing_fresh_days: z.number().int().min(7).max(180),
  demo_data_visible: z.boolean(),
  online_payments_enabled: z.boolean(),
  online_payment_provider: z.string().trim().max(80).optional().nullable(),
});

export const vendorPromotionCreateSchema = z.object({
  vendorId: z.string().uuid(),
  durationDays: z.number().int().min(1).max(365),
  label: z.string().trim().min(2).max(60).default("Premium vendor"),
  rewardReason: z.enum([
    "referral_reward",
    "launch_reward",
    "performance_reward",
    "commercial",
    "other",
  ]),
  adminNote: z.string().trim().max(500).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const adminCancelSchema = z.object({ id: z.string().uuid() });

export const marketplacePromotionCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    serviceFeeDiscountPercent: z.number().int().min(0).max(100),
    deliveryDiscountPercent: z.number().int().min(0).max(100),
    durationDays: z.number().int().min(1).max(90),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .refine(
    (value) =>
      value.serviceFeeDiscountPercent > 0 || value.deliveryDiscountPercent > 0,
    {
      message: "Discount the Get Gold fee, delivery, or both",
    },
  );

const marketingHref = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a site path or secure https:// link");

export const siteBannerCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    body: z.string().trim().max(280).optional().nullable(),
    imageAlt: z.string().trim().max(160).optional().nullable(),
    ctaLabel: z.string().trim().min(2).max(40).optional().nullable(),
    ctaHref: marketingHref.optional().nullable(),
    placement: z.enum([
      "home_top",
      "home_middle",
      "marketplace_top",
      "vendors_top",
    ]),
    displayOrder: z.number().int().min(0).max(100),
    durationDays: z.number().int().min(1).max(90),
    startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.ctaLabel) !== Boolean(value.ctaHref)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ctaHref"],
        message: "Add both the button text and link",
      });
    }
  });

export const vendorOrderProgressSchema = z.object({
  reservationId: z.string().uuid(),
  action: z.enum([
    "confirm_payment_received",
    "start_preparing",
    "mark_ready",
    "mark_out_for_delivery",
    "mark_delivered",
    "complete",
  ]),
});

export const buyerRequestCreateSchema = z
  .object({
    category: z.enum([
      "ring",
      "necklace",
      "bracelet",
      "earring",
      "bangle",
      "chain",
      "pendant",
      "bar",
      "coin",
      "other",
    ]),
    karat: z.union([
      z.literal(12),
      z.literal(14),
      z.literal(16),
      z.literal(18),
      z.literal(21),
      z.literal(22),
      z.literal(24),
    ]),
    budgetMinAed: z.number().min(0).max(10_000_000),
    budgetMaxAed: z.number().positive().max(10_000_000),
    emirate: z.enum(UAE_EMIRATES),
    neededBy: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    description: z.string().trim().min(20).max(2000),
    referenceImagePath: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((request, ctx) => {
    if (request.budgetMaxAed < request.budgetMinAed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetMaxAed"],
        message: "Maximum budget must be at least the minimum",
      });
    }
    if (
      request.neededBy &&
      new Date(`${request.neededBy}T23:59:59Z`).getTime() < Date.now()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["neededBy"],
        message: "Choose a future date",
      });
    }
  });

export const buyerRequestOfferSchema = z.object({
  requestId: z.string().uuid(),
  productId: z.string().uuid().optional().nullable(),
  totalPriceAed: z.number().positive().max(10_000_000),
  makingChargeAed: z.number().min(0).max(1_000_000),
  certificateFeeAed: z.number().min(0).max(1_000_000),
  estimatedDays: z.number().int().min(1).max(180),
  supportsDelivery: z.boolean(),
  note: z.string().trim().min(10).max(1000),
});

export const buyerRequestAcceptOfferSchema = z.object({
  offerId: z.string().uuid(),
});

export const storeVisitRequestSchema = z
  .object({
    productId: z.string().uuid(),
    preferredAt: z.string().datetime({ offset: true }),
    phone: z.string().trim().min(7).max(20),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (value) => new Date(value.preferredAt).getTime() > Date.now() + 30 * 60_000,
    {
      path: ["preferredAt"],
      message: "Choose a time at least 30 minutes from now",
    },
  );

export const storeVisitResponseSchema = z.object({
  visitId: z.string().uuid(),
  decision: z.enum(["confirm", "decline", "complete"]),
});

export const catalogueSupportRequestSchema = z.object({
  targetListingCount: z.number().int().min(10).max(20),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const catalogueSupportUpdateSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum([
    "requested",
    "scheduled",
    "in_progress",
    "completed",
    "cancelled",
  ]),
  adminNote: z.string().trim().max(1000).optional().nullable(),
});

export const inventoryConfirmationSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
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
  reason: z.enum([
    "spam",
    "fake_or_misleading",
    "abusive",
    "personal_information",
    "other",
  ]),
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

export const notificationPreferencesSchema = z.object({
  language: z.enum(["en", "ar"]),
  inAppNotifications: z.boolean(),
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  whatsappNotifications: z.boolean(),
  marketingNotifications: z.boolean(),
});

export const favouriteSchema = z.object({ productId: z.string().uuid() });

export const priceAlertSchema = z
  .object({
    productId: z.string().uuid(),
    targetTotalAed: z
      .number()
      .positive()
      .max(100_000_000)
      .optional()
      .nullable(),
    notifyOnMakingOffer: z.boolean().default(true),
  })
  .refine(
    (value) => value.targetTotalAed != null || value.notifyOnMakingOffer,
    {
      message: "Choose a target price or making-charge offer alert",
    },
  );

export const deliveryAssignmentSchema = z.object({
  reservationId: z.string().uuid(),
  deliveryCompanyId: z.string().uuid(),
  publicNote: z.string().trim().max(500).optional().nullable(),
});

export const deliveryStatusSchema = z
  .object({
    assignmentId: z.string().uuid(),
    status: z.enum([
      "accepted",
      "pickup_scheduled",
      "collected",
      "out_for_delivery",
      "delivered",
      "declined",
      "delivery_failed",
    ]),
    publicNote: z.string().trim().max(500).optional().nullable(),
    proofReference: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (value) => value.status !== "delivered" || Boolean(value.proofReference),
    {
      path: ["proofReference"],
      message:
        "Add a delivery proof reference before marking this order delivered",
    },
  );

export const marketplaceEventSchema = z.object({
  eventName: z.enum([
    "marketplace_view",
    "search",
    "product_view",
    "favourite_added",
    "compare_added",
    "alert_created",
    "identity_started",
    "referral_shared",
  ]),
  anonymousSessionId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  metadata: z
    .record(z.union([z.string().max(120), z.number(), z.boolean(), z.null()]))
    .optional()
    .default({}),
});

export const adminPaymentDisputeSchema = z
  .object({
    reservationId: z.string().uuid(),
    action: z.enum(["report", "resolve", "clear"]),
    note: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "report" && (!value.note || value.note.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "Add a short reason for the dispute.",
      });
    }
  });
