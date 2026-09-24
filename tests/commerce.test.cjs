const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLoader } = require("./load-ts.cjs");
const load = createLoader();
const {
  coordinatesFromDeliveryMapLink,
  deliveryPinUrl,
  isAcceptedDeliveryMapLink,
} = load("src/lib/fulfilment.ts");
const {
  applyCustomerServiceFee,
  applyDeliveryFee,
  computePrice,
  computeOrderTotal,
  goldRateForKarat,
} = load("src/lib/pricing/calc.ts");
const { applyEventDeliveryDiscount, applyEventFeeDiscount } = load(
  "src/lib/marketing.ts",
);
const { calculateReservationValue } = load("src/lib/gold-insights.ts");
const { onlinePaymentCheckoutIsOperational } = load(
  "src/lib/payments/readiness.ts",
);
const { canTransitionDelivery } = load("src/lib/delivery/transitions.ts");
const {
  deliveryCompanyOnboardingSchema,
  deliveryStatusSchema,
  productUpsertSchema,
  vendorOnboardingSchema,
} = load(
  "src/lib/validation/schemas.ts",
);
const { isSecureExternalPaymentUrl, paymentLinkHost } = load(
  "src/lib/order-messages.ts",
);
const { serializeJsonLd } = load("src/lib/security/json-ld.ts");
const base = {
  pricePerGram24kAed: 500,
  karat: 24,
  weightGrams: 1,
  makingCharge: 100,
  makingChargeDiscountPercent: 0,
  makingChargeOfferEndsAt: null,
  certificateFee: 0,
  stoneValue: 0,
  vendorPremium: 0,
  platformFeeBps: 50,
  deliveryFee: 20,
  pricedAt: Date.parse("2026-09-14T00:00:00Z"),
};

test("missing or blank coordinates do not produce a false 0,0 map pin", () => {
  for (const value of [null, undefined, "", " "])
    assert.equal(
      deliveryPinUrl({
        fulfilment_method: "delivery",
        delivery_latitude: value,
        delivery_longitude: value,
      }),
      null,
    );
});
test("valid coordinates take priority; invalid coordinates use a safe HTTPS fallback", () => {
  assert.match(
    deliveryPinUrl({
      fulfilment_method: "delivery",
      delivery_latitude: "25.186",
      delivery_longitude: "55.263",
    }),
    /query=25.186,55.263$/,
  );
  assert.equal(
    deliveryPinUrl({
      fulfilment_method: "delivery",
      delivery_latitude: 91,
      delivery_longitude: 181,
      delivery_map_link: "https://maps.google.com/example",
    }),
    "https://maps.google.com/example",
  );
  assert.equal(
    deliveryPinUrl({
      fulfilment_method: "delivery",
      delivery_map_link: "javascript:alert(1)",
    }),
    null,
  );
});
test("first three orders receive a 0.5% customer service fee", () => {
  const price = computePrice(base);
  assert.equal(price.platformFee, 3);
  assert.equal(price.vatAed, 31.15);
  assert.equal(price.unitPriceAed, 654.15);
  assert.equal(goldRateForKarat(500, 22), 458);
});
test("customer service fee becomes 1% after the introductory orders", () => {
  const introductory = computePrice(base);
  const standard = applyCustomerServiceFee(introductory, 100);
  assert.equal(standard.platformFeeBps, 100);
  assert.equal(standard.platformFee, 6);
  assert.equal(standard.unitPriceAed, 657.3);
  assert.equal(computeOrderTotal(standard, 3), 1929.9);
});
test("making charge discount reduces customer price and customer fee", () => {
  const price = computePrice({ ...base, makingChargeDiscountPercent: 20 });
  assert.equal(price.makingCharge, 80);
  assert.equal(price.platformFee, 2.9);
  assert.equal(price.unitPriceAed, 633.05);
});
test("100% making offer expires at its exact deadline", () => {
  const active = computePrice({
    ...base,
    makingChargeDiscountPercent: 100,
    makingChargeOfferEndsAt: "2026-09-15T00:00:00Z",
  });
  assert.equal(active.makingCharge, 0);
  const expired = computePrice({
    ...base,
    makingChargeDiscountPercent: 100,
    makingChargeOfferEndsAt: "2026-09-14T00:00:00Z",
  });
  assert.equal(expired.makingCharge, 100);
});
test("certificate-only bars retain their certificate charge when making is zero", () => {
  const price = computePrice({ ...base, makingCharge: 0, certificateFee: 25 });
  assert.equal(price.makingCharge, 0);
  assert.equal(price.certificateFee, 25);
  assert.equal(price.platformFee, 2.63);
  assert.equal(price.unitPriceAed, 575.01);
});
test("online checkout remains disabled until an actual processor is integrated", () => {
  assert.equal(onlinePaymentCheckoutIsOperational(), false);
});
test("delivery is charged once for a multi-item order; collection is free", () => {
  assert.equal(computeOrderTotal(computePrice(base), 3), 1920.45);
  assert.equal(computeOrderTotal(computePrice(base), 1), 654.15);
  assert.equal(
    computeOrderTotal(computePrice({ ...base, deliveryFee: 0 }), 3),
    1899.45,
  );
  for (const quantity of [0, -1, 1.5, 51, NaN])
    assert.throws(() => computeOrderTotal(computePrice(base), quantity));
});
test("store rate adjustment is transparent and included before fee and VAT", () => {
  const price = computePrice({
    ...base,
    karat: 18,
    weightGrams: 4.5,
    vendorRateAdjustmentPerGram: 10,
  });
  assert.equal(price.purityFactor, 0.75);
  assert.equal(price.vendorRateAdjustmentPerGram, 10);
  assert.equal(price.vendorRateAdjustmentAed, 45);
  assert.equal(price.merchandiseSubtotalAed, 1832.5);
  assert.equal(price.platformFee, 9.16);
  assert.equal(price.vatAed, 93.08);
});
test("UAE common karats map to statutory fineness factors", () => {
  for (const [karat, factor] of [
    [24, 1],
    [22, 0.916],
    [21, 0.875],
    [18, 0.75],
    [16, 0.666],
    [14, 0.583],
    [12, 0.5],
  ]) {
    assert.equal(
      computePrice({ ...base, karat, vendorRateAdjustmentPerGram: 0 })
        .purityFactor,
      factor,
    );
  }
});
test("certified bullion fineness overrides the 999 reference while retaining the karat label", () => {
  const price = computePrice({ ...base, karat: 24, assayFineness: 995 });
  assert.equal(price.assayFineness, 995);
  assert.ok(Math.abs(price.purityFactor - 995 / 999) < 1e-12);
  assert.equal(price.goldValueAed, 498);
  assert.equal(price.merchandiseSubtotalAed, 598);
});

test("legacy vendor premiums never increase new quotes, fees or VAT", () => {
  for (const vendorPremium of [0, 55, 150, 1000000]) {
    const price = computePrice({ ...base, vendorPremium });
    assert.equal(price.vendorPremium, 0);
    assert.equal(price.merchandiseSubtotalAed, 600);
    assert.equal(price.platformFee, 3);
    assert.equal(price.vatAed, 31.15);
    assert.equal(computeOrderTotal(price, 3), 1920.45);
  }
});

test("vendor VAT choices are explicit, restricted and require a no-VAT declaration", () => {
  const product = {
    name: "22K Test ring",
    category: "ring",
    karat: 22,
    weight_grams: 2,
    making_charge: 100,
    making_charge_discount_percent: 0,
    making_charge_offer_ends_at: null,
    certificate_fee: 0,
    stone_value: 0,
    quantity: 1,
    vat_rate_bps: 500,
  };
  assert.equal(productUpsertSchema.parse(product).vendor_premium, 0);
  assert.equal(
    productUpsertSchema.parse({
      ...product,
      vat_rate_bps: 0,
      vat_choice_confirmed: true,
    }).vat_rate_bps,
    0,
  );
  for (const invalid of [
    { ...product, vat_rate_bps: 0 },
    { ...product, vat_rate_bps: 100 },
    { ...product, vat_rate_bps: undefined },
    { ...product, vat_rate_bps: "500" },
    { ...product, vendor_premium: 25 },
  ])
    assert.equal(productUpsertSchema.safeParse(invalid).success, false);
  assert.equal(
    productUpsertSchema.parse({
      ...product,
      category: "bar",
      assay_fineness: 999.9,
    }).assay_fineness,
    999.9,
  );
  assert.equal(
    productUpsertSchema.safeParse({ ...product, assay_fineness: 999.9 })
      .success,
    false,
  );
  assert.equal(
    productUpsertSchema.safeParse({
      ...product,
      category: "bar",
      assay_fineness: 999.95,
    }).success,
    false,
  );
});
test("delivery pins accept only Google or Apple Maps links and extract visible coordinates", () => {
  for (const link of [
    "https://maps.app.goo.gl/abc123",
    "https://maps.apple.com/?q=25.199,55.281",
    "https://www.google.com/maps/@25.1993,55.2814,15z",
    "https://goo.gl/maps/abc123",
  ])
    assert.equal(isAcceptedDeliveryMapLink(link), true);
  for (const link of [
    "test",
    "http://maps.google.com/example",
    "https://example.com/maps/@25.1,55.2",
    "https://google.com.example.com/maps",
  ])
    assert.equal(isAcceptedDeliveryMapLink(link), false);
  assert.deepEqual(
    coordinatesFromDeliveryMapLink(
      "https://www.google.com/maps/@25.19934567,55.28145678,15z",
    ),
    { latitude: 25.199346, longitude: 55.281457 },
  );
  assert.deepEqual(
    coordinatesFromDeliveryMapLink("https://maps.apple.com/?q=25.2%2C55.3"),
    { latitude: 25.2, longitude: 55.3 },
  );
  assert.equal(
    coordinatesFromDeliveryMapLink("https://maps.app.goo.gl/abc123"),
    null,
  );
});
test("seasonal promotions stack after the customer introductory fee and snapshot-friendly delivery math", () => {
  assert.equal(applyEventFeeDiscount(50, 50), 25);
  assert.equal(applyEventFeeDiscount(50, 25), 37);
  assert.equal(applyEventFeeDiscount(100, 100), 0);
  assert.equal(applyEventDeliveryDiscount(35, 20), 28);
  const promoted = applyDeliveryFee(computePrice(base), 0);
  assert.equal(promoted.deliveryFee, 0);
  assert.equal(promoted.unitPriceAed, 633.15);
  assert.equal(computeOrderTotal(promoted, 3), 1899.45);
});
test("qualifying investment bullion can be explicitly zero-rated", () => {
  const price = computePrice({ ...base, vatRateBps: 0 });
  assert.equal(price.vatRateBps, 0);
  assert.equal(price.vatAed, 0);
  assert.equal(price.unitPriceAed, 623);
  assert.equal(computeOrderTotal(price, 3), 1829);
});
test("gold insights preserve both legacy and per-order delivery without invented savings", () => {
  const snapshot = {
    gold_price_per_gram_24k_aed: 500,
    karat_purity_factor: 1,
    weight_grams: 1,
    gold_value_aed: 500,
    quantity: 3,
  };
  for (const total of [1869, 1829]) {
    assert.equal(
      calculateReservationValue({ ...snapshot, total_price_aed: total }, 500)
        .differenceAed,
      0,
    );
    assert.equal(
      calculateReservationValue({ ...snapshot, total_price_aed: total }, 510)
        .currentComparableTotalAed,
      total + 30,
    );
  }
});
test("courier lifecycle allows forward progress and a failed-delivery retry", () => {
  for (const [from, to] of [
    ["offered", "accepted"],
    ["offered", "declined"],
    ["accepted", "pickup_scheduled"],
    ["pickup_scheduled", "collected"],
    ["collected", "out_for_delivery"],
    ["out_for_delivery", "delivered"],
    ["out_for_delivery", "delivery_failed"],
    ["delivery_failed", "out_for_delivery"],
  ]) {
    assert.equal(canTransitionDelivery(from, to), true);
  }
});
test("courier lifecycle cannot skip capture or reopen a terminal state", () => {
  for (const [from, to] of [
    ["offered", "delivered"],
    ["accepted", "collected"],
    ["delivered", "out_for_delivery"],
    ["declined", "accepted"],
    ["cancelled", "accepted"],
    ["unknown", "accepted"],
  ]) {
    assert.equal(canTransitionDelivery(from, to), false);
  }
});
test("delivery completion requires a separate nonblank proof reference", () => {
  const assignmentId = "11111111-1111-4111-8111-111111111111";
  for (const proofReference of [undefined, null, "", "   "]) {
    assert.equal(
      deliveryStatusSchema.safeParse({
        assignmentId,
        status: "delivered",
        proofReference,
        publicNote: "A note is not proof",
      }).success,
      false,
    );
  }
  assert.equal(
    deliveryStatusSchema.safeParse({
      assignmentId,
      status: "delivered",
      proofReference: "POD-TEST-1",
    }).success,
    true,
  );
  assert.equal(
    deliveryStatusSchema.safeParse({ assignmentId, status: "accepted" })
      .success,
    true,
  );
});
test("vendor payment links require a public credential-free HTTPS destination", () => {
  for (const url of [
    "https://pay.vendor.example/order/123",
    "https://checkout.network.ae/session?id=abc",
  ])
    assert.equal(isSecureExternalPaymentUrl(url), true);
  for (const url of [
    "http://pay.vendor.example/order/123",
    "https://user:password@pay.vendor.example/order/123",
    "https://localhost/order/123",
    "https://127.0.0.1/order/123",
    "https://192.168.1.10/order/123",
    "javascript:alert(1)",
  ])
    assert.equal(isSecureExternalPaymentUrl(url), false);
  assert.equal(
    paymentLinkHost("https://www.pay.vendor.example/order/123"),
    "pay.vendor.example",
  );
});
test("structured data cannot escape its script element", () => {
  const malicious = '</script><script>alert("xss")</script>\u2028&';
  const serialised = serializeJsonLd({ name: malicious });
  assert.equal(serialised.includes("</script>"), false);
  assert.equal(serialised.includes("<"), false);
  assert.equal(JSON.parse(serialised).name, malicious);
});
test("business onboarding accepts only safe public websites and Maps pins", () => {
  const vendor = {
    business_name: "Test Gold Store",
    trade_license_number: "TL-12345",
    license_expiry_date: "2027-09-23",
    owner_name: "Test Owner",
    email: "owner@example.ae",
    phone: "0501234567",
    emirate: "Dubai",
    store_address: "Gold Souq, Deira, Dubai",
    google_maps_link: "https://maps.google.com/?q=25.27,55.30",
    website_available: true,
    website_url: "https://store.example.ae",
  };
  assert.equal(vendorOnboardingSchema.safeParse(vendor).success, true);
  for (const website_url of [
    "javascript:alert(1)",
    "http://store.example.ae",
    "https://localhost/store",
    "https://192.168.1.10/store",
  ]) {
    assert.equal(
      vendorOnboardingSchema.safeParse({ ...vendor, website_url }).success,
      false,
    );
  }
  assert.equal(
    vendorOnboardingSchema.safeParse({
      ...vendor,
      google_maps_link: "https://evil.example/location",
    }).success,
    false,
  );
  assert.equal(
    deliveryCompanyOnboardingSchema.safeParse({
      company_name: "Safe Courier",
      trade_license_number: "DL-12345",
      license_expiry_date: "2027-09-23",
      contact_name: "Courier Owner",
      email: "courier@example.ae",
      phone: "0501234567",
      emirates_served: ["Dubai"],
      website: "javascript:alert(1)",
    }).success,
    false,
  );
});
