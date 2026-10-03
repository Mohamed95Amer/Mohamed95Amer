# Quick design and pricing audit — 16 September 2026

## Changes delivered

- Raised small product-card pricing/supporting text and trust-strip text; made totals more prominent and stopped truncating vendor names.
- Separated Get Gold fee and VAT in cards rather than grouping all extra costs together.
- Moved mobile carousel controls into their own space, preventing headline/CTA collisions. Slide selectors use ordinary keyboard-operable buttons rather than an incomplete ARIA tab pattern.
- Removed duplicated tiny hero promises on mobile; the readable trust strip remains.
- Kept search/category/purity/sort visible and placed secondary marketplace filters in an expandable panel. Existing secondary selections automatically reopen it.
- Removed vendor premium from every new quote through the shared calculation used by display and official server pricing. Legacy stored catalogue values are ignored; vendor submissions accept only zero. Historical order snapshots and nonzero historical receipt lines are preserved.
- Added per-product VAT selection to vendor create/edit: 5% or no VAT. Zero requires an explicit vendor declaration, recorded in the existing audit log. The existing VAT column is used; no schema migration or bulk product-data rewrite was needed.
- VAT changes take approved listings out of sale until resubmission/admin approval. Suspended products stay suspended. Writes check ownership and the previously read update timestamp.
- Added VAT visibility to vendor inventory and admin product review. Zero is labelled “Not charged”, not automatically asserted to be a legal exemption.
- Improved vendor form network-error recovery and field-validation feedback.

## Evidence

- 43 application tests pass; 20 isolated Auth/PostgREST/Storage integration tests pass.
- New integration coverage creates and edits a product with both VAT settings, reads the values back, computes official no-VAT pricing, rejects vendor premium and missing declaration, denies an unrelated user, and preserves suspension.
- Existing end-to-end order integration fixtures now contain nonzero legacy product premiums; unchanged expected totals prove the premium is not silently charged by the reservation path.
- Typecheck, lint, local production build and Vercel production build passed; 28/28 generated pages.
- Live mobile product page: premium absent, complete breakdown, fresh goldapicom quote, no horizontal overflow or failed image.
- Live vendor form: both VAT options and conditional declaration verified using the existing demo vendor account; no product saved, and signed out afterwards.
- Live homepage: mobile controls pause correctly, no overlapping content, no broken images or console errors. Marketplace secondary filters expand correctly.

Production: `2bn7otC7yhVUxq9cqevJmdPEHZ2D`, aliased to https://getgold.ae.

## Scope and tax caution

This was a focused visual/pricing audit, not a full legal, accessibility or security certification. No live order or identity-verification session was created. Existing launch gates in PHASE1-OWNER-CHECKLIST.md remain.

The selector records the vendor's treatment; it does not decide eligibility. The existing single-rate order model remains (the selected rate is applied to the complete taxable order including fees/delivery). Separate tax treatment of independently supplied marketplace/delivery services requires tax-adviser confirmation before relying on this model for such arrangements.

FTA guidance states that 5% generally applies unless a transaction qualifies for a different treatment: https://tax.gov.ae/en/faq.aspx?keyword=Does+VAT+apply+to+all+goods+and+services%3F . Do not advertise the no-VAT setting as a discretionary discount.
