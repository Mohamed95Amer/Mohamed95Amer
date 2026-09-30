# Get Gold — handover

**Latest checkpoint — payment-destination approval and shared limiter readiness (23 Sep 2026; deployed):**
Vendor approval and payment-destination approval are now separate trust decisions. A
new or changed Aani number, beneficiary, bank name or IBAN is set to `pending` by a
database trigger; Aani/bank transfer is hidden from the product checkout and rejected
again by both reservation and vendor-confirmation APIs until an admin approves the
current destination. Cash and card-at-handover remain usable. Admins see pending/rejected
badges in `/admin/vendors`, review masked details by default in the vendor detail page,
may reveal them for document comparison, and must leave a correction note when rejecting.
Every decision and vendor edit is audit logged without storing the full phone or IBAN.
Existing confirmed-order snapshots are never rewritten. Production had no payment-settings
rows at migration time, so no active production destination was interrupted.

The database trigger makes re-review race-safe: a payment destination change atomically
clears the previous reviewer/timestamp and returns to pending, while a delivery-fee or
working-setting edit preserves approval. The browser still has no direct access to the
private settings table or trigger helper. Five previous foreign-key advisor findings plus
the new reviewer foreign key now have covering indexes; the production performance advisor
has no remaining unindexed-FK finding.

All API routes that already used application rate limits now call one asynchronous limiter.
It automatically uses Upstash Redis across all Vercel instances when
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present, with telemetry off and
a one-second bounded fallback if Redis is unavailable. Production does not yet have those
two variables, so limits currently use the safe per-instance fallback. Registration and
password-reset forms require at least 12 characters, and production Supabase Auth now
enforces the same 12-character minimum (verified through remote config on 24 Sep 2026).

Local migrations `20260923190510_vendor_payment_destination_approval.sql`,
`20260923190514_add_missing_foreign_key_indexes.sql` and
`20260923192408_index_payment_destination_reviewer.sql` are recorded in production as
`20260923192306`, `20260923192319` and `20260923192446`. Evidence: 62/62 application
tests, 93/93 pgTAP assertions, 23/23 isolated integration tests, schema lint, typecheck,
ESLint, local/Vercel builds and npm audit (zero vulnerabilities) pass. Production deployment
`dpl_9DKVxrJnebc62gUXUA74N7Bkkx2g` is Ready and aliased to https://getgold.ae. Live pages
return 200, the admin endpoint rejects signed-out access, security headers remain present,
and the quote is fresh `goldapicom` with separate 10-second refresh / 60-second stale limits.

**Latest checkpoint — full marketplace security hardening (23 Sep 2026; deployed):**
The customer/vendor/admin/identity/payment trust chain was reviewed across every API
mutation, server/service-role use, RLS policy, grant, view, privileged function,
Realtime table and Storage bucket. Vendor-controlled JSON-LD text can no longer close
its script element; stored website and map links are restricted to public HTTPS or
accepted Maps destinations; vendor payment links no longer claim platform certification.
Cookie-authenticated API mutations now reject missing or cross-site origins (signed
webhooks and secret cron calls stay exempt). CSP, frame denial, MIME sniff protection,
strict referrer policy, COOP and two-year HSTS are present in production. Analytics and
Didit payloads have explicit bounds, and the process-local limiter evicts expired keys
and cannot grow without limit.

Migration `20260923142931_marketplace_security_hardening.sql` is applied locally and
recorded in production as `20260923144655_marketplace_security_hardening`. Public signup
metadata always creates a customer profile; only the validated vendor/courier onboarding
routes may promote a business role. Anonymous grants were removed from profiles, orders,
snapshots, private documents and audit rows; participant/admin policies are explicitly
authenticated and use statement-cached auth lookups. Trigger-only execution is revoked.
Product uploads are capped at 5 MB and image MIME types; vendor documents are capped at
10 MB and PDF/JPEG/PNG, with authenticated owner/admin Storage policies and update rules.
Production readback confirms every limit, grant and policy. The previous three RLS
performance warnings are gone. The 24 no-policy INFO notices are intentional service-only
deny-all tables. The remaining advisor warning is an account setting: leaked-password
protection is disabled.

Evidence: 60/60 app tests, 78/78 pgTAP checks, 23/23 isolated Auth/PostgREST/Storage
integration tests, schema lint, typecheck, ESLint, local build, Vercel build and npm audit
(0 known vulnerabilities) pass. Live public routes return 200; a fresh `goldapicom` quote
still reports separate 10-second refresh and 60-second stale thresholds; same-origin
analytics returns 204 while missing/cross-site cookie origins return 403. Deployment
`dpl_CFQV83dNUmRSunJ6ZzAVDu16VGGA` is Ready and aliased to https://getgold.ae.

GitHub dependency alerts and secret scanning with push protection were enabled for the
public repository. Secret scanning currently reports zero alerts. GitHub still reports
49 dependency alerts against the vulnerable `main` snapshot (including Next 14.2.15);
this branch uses patched Next 15.5.24 and `npm audit` is clean. PR #10 must eventually be
merged/rebased into the default branch so GitHub can close those alerts. Main is not
branch-protected; enabling protection was deliberately left to the owner because it
changes the repository workflow.

Launch controls that still require account/contract decisions: enable Supabase leaked-
password protection (paid plan), CAPTCHA and server-side strong Auth password/OTP settings; enforce
MFA on Supabase, GitHub, Vercel and the domain/email provider; configure custom SMTP;
review SSL enforcement/network restrictions and backup/PITR requirements; provision the
two Upstash Redis variables to activate the already-wired shared limiter before meaningful
traffic; complete Didit live-mode/DPA/legal approval and a real hosted-flow test before processing identity data;
and arrange an independent penetration test before accepting real high-value orders.
No security audit can guarantee zero risk.

Vendor payment destinations remain a phase-one operational control: the admin approval
gate and automatic re-review are implemented, but a human must actually compare each Aani
number/IBAN/beneficiary with official vendor evidence. A vendor-hosted HTTPS payment page
is still vendor-provided rather than platform-certified. The customer UI displays its
hostname and warns never to share a bank password or OTP; HTTPS validation alone is not
a trust certification. A future PSP/open-banking confirmation would reduce this manual work.

**Latest checkpoint — private order chat and vendor payment links (23 Sep 2026; deployed):**
Customers and the matching approved vendor now have one private conversation inside
each order. Customers open it from their order-detail page; vendors use **Vendor →
Orders → Message customer**. New messages create an in-app notification for the other
party and the conversation refreshes through one order-scoped Realtime channel with a
15-second polling fallback. English/Arabic copy and 390 px mobile layouts are covered.

Vendors can send a structured, clickable HTTPS payment link only after they have
confirmed availability/final price and the customer has accepted it, while the payment
window is still active. URLs typed in ordinary messages remain plain text. A link,
transaction reference or screenshot is evidence only: none can mark an order paid.
The vendor must still verify their own bank/payment-provider account and explicitly
confirm receipt before fulfilment can proceed. The existing vendor-direct settlement
and stock/price-lock controls are unchanged.

`order_messages` is immutable to browser clients: authenticated users receive SELECT
only, anon has no access, and the server validates participant ownership, approved
vendor status, link safety, message size and a 20/minute user rate limit before the
service role inserts. RLS permits only the order customer, vendor owner or admin to
read. The new reservation/time and sender foreign-key indexes are present and the
table is in `supabase_realtime`. Local migrations are
`20260923110601_order_messages.sql` and
`20260923112914_order_messages_sender_index.sql`; production recorded them as
`20260923112834_order_messages` and `20260923112941_order_messages_sender_index`.

Verification: 58/58 app tests, 66/66 pgTAP checks, typecheck, ESLint and local/Vercel
production builds (33 static pages) pass. The disposable local Auth/PostgREST/browser
test proves customer/vendor sends, outsider denial, customer link-forgery denial,
pre-acceptance link denial, notifications, both mobile pages and unchanged payment
state. Production readback confirms RLS, no authenticated INSERT, no anon SELECT, one
scoped policy, Realtime publication, both indexes and zero rollout messages. Live smoke:
homepage/marketplace 200, unauthenticated message API 401, and a fresh `goldapicom`
quote with 10-second refresh and 60-second stale thresholds. Deployment
`B22x5iZQZLZw5V8QFFzVEErTADiX` is Ready and aliased to https://getgold.ae.

**Latest checkpoint — site-wide responsiveness pass (23 Sep 2026; deployed):**
Server authentication and profile reads are now request-memoized with React `cache`,
so the root header, protected layout, page and admin data loaders share one verified
user/profile result instead of repeating the same Supabase Auth/PostgREST round trips.
Non-customer headers no longer call the customer advertising-inbox RPC; they perform
only the operational unread count needed by the bell.

The single global gold-price provider still owns exactly one 10-second poll and one
Realtime channel. Its one-second age clock was removed from the shared context because
it forced every product card on a listing grid to recalculate each second even when the
quote had not changed. Only the two small components that visibly display quote age now
tick each second. The provider schedules one update at the 60-second stale boundary,
and the Realtime client is loaded 750 ms after mount so first paint is not competing with
websocket setup. Do not move subscriptions back into cards or merge refresh/stale timing.

Verification: 57/57 app tests, typecheck, ESLint and local/Vercel production builds pass.
All five public performance routes returned 200 after deployment; a warmed 390 px Chrome
run measured TTFB 134–147 ms and LCP 0.74–1.32 s, with marketplace LCP improving from
1.03 s to 0.82 s and homepage from 1.45 s to 1.32 s in the same probe. The live endpoint
still reports `goldapicom`, `status: ok`, 10-second refresh and 60-second stale threshold.
The reusable read-only probe is `scripts/profile-performance.cjs`.
Deployment `8JVDxxiwLN4ZBrKqwaCbrGCyX2zU` is Ready and aliased to https://getgold.ae.

**Latest checkpoint — admin insights, commission accounts and timed promotions (23 Sep 2026; deployed):**
Admin overview now has a compact six-item primary navigation with secondary tools,
real-data default, 7/30/90 Dubai-calendar-day performance filters, store selection,
daily earned-fee/paid-order charts with exact-value tables, and current order pipeline.
Display period/chart visibility are remembered per admin on that device. Account
balances are explicitly **all-time** and never silently restricted by the date filter.

`/admin/commissions` shows fees earned, recorded receipts, net credits and balance
overall/per store, plus underlying orders and links to the existing payment trail.
Fees come from immutable current-model snapshots × quantity, not today's rate.
Only paid non-refunded/non-cancelled orders earn fees. Delivery campaign subsidies
reduce the balance; receipts/credits reduce it and debit corrections increase it.
Negative balances remain visible as store credits. Legacy pricing and missing
snapshots are flagged; demo data is excluded by default. Paginated server reads
avoid PostgREST's default 1,000-row truncation. Receipts require a reference and an
explicit admin attestation; adjustments require a reason. Entries may be voided
with a reason, never silently overwritten. RPC mutation + audit insert are atomic.
This is manual reconciliation, **not** bank verification or automatic collection,
and it never changes a customer order total or vendor payment-confirmation state.

`/admin/notifications` supports draft/edit/preview, explicit publish, Dubai start
time, 1–90-day expiry presets, optional Arabic text, internal links and cancellation.
Audience: all opted-in customers, customers with a paid non-demo order, or those
without one. Audience eligibility is dynamic when the inbox is loaded. Promotions
are separate from operational notifications and labelled Ad; no email/SMS/WhatsApp/
push is sent. Published copy is immutable (cancel and replace). Consent, start/end,
role and read receipts are enforced server-side. Inboxes refresh each minute while
visible, and on returning to the tab. Mark-all-read no longer consumes future
operational notifications. A proper accessible bell now appears on desktop/mobile.
No real campaign was published and no real receipt was inserted during rollout.

Migration `20260923042658_admin_workspace_campaigns_commissions.sql` applied to
production `xgbzvdrdpinwkdbgpxdh` and local history. Three new tables are service-only
with RLS enabled, browser grants revoked, and no service-role DELETE grants. New
management RPCs check trusted admin roles. The view has security_invoker=true.
Production order-view grain verified 4 rows = 4 reservations. Zero customer access
to ledger/campaign management; zero production campaign/ledger records at rollout.

Verification: 57 unit tests, 23 existing isolated integration tests, 59 pgTAP checks,
local schema lint, typecheck, ESLint and local/Vercel builds (33 static pages) pass.
`scripts/test-admin-workspace.cjs` exercises actual local Auth/PostgREST/browser
flows: receipt/void/audit, duplicate-ID denial, admin access checks, three-unit
commission snapshot, draft/publish, opt-out, audience, read, scheduling, expiry,
cancellation and future-notification protection. Desktop/390px English/Arabic
screens have no viewport overflow or runtime errors. Synthetic fixtures cleaned.
Visual evidence: `output/admin-workspace-20260923/` (untracked local-only).
Deployment `D72262v1A8RTJPvg5u7eaG4sCFjq` is Ready, aliased to https://getgold.ae.

Advisors: new tables' RLS-without-policies INFO is intentional deny-all for browser
roles; do not add broad read policies to silence it. Existing Auth warning remains:
[leaked password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Existing performance advisories are outside this change; new foreign keys are indexed.

**Latest checkpoint — vendor workspace redesign (23 Sep 2026; deployed):**
Vendor overview now prioritises actionable requests, payment checks and fulfilment,
with an actual settings-backed setup checklist. Navigation separates everyday work
from store tools. Orders and products use mobile cards, search and status filters;
expired requests cannot look actionable and customer proof never confirms payment.
Order cards retain the private receipt, fee/VAT details, delivery assignment and
store-visit controls. Existing payment/stock RPCs are unchanged.

Product entry is organised into details, photos, charges and review, with listing
quality checks, a live merchandise subtotal preview using the shared gold provider,
touch-visible photo controls and separate making/certificate/assay/VAT inputs.
Payment methods, delivery settings and UAE opening hours have clearer guidance,
including copy-hours-to-open-days. Documents, catalogue assistance, buyer offers
and review replies have better mobile layouts and recoverable network errors.
Key vendor screens and forms have English/Arabic copy. Resubmitting business
details explicitly warns that existing backend behaviour returns the store to
admin review; it does not silently leave an approved store published.

Verification: 52/52 app tests, 23/23 isolated integration tests, typecheck,
ESLint and production build (31 static pages) pass. The integration payment
fixtures now explicitly use an always-open schedule: previously they incorrectly
assumed the real clock was inside default 10:00–22:00 opening hours. The separate
closed-store test still verifies queueing and denial before opening.
`scripts/test-vendor-workspace.cjs` covers search/filter, missing-photo validation,
real local Storage upload/draft save, Aani settings and working-hours saves, plus
ten vendor routes on 390px mobile in English/Arabic without overflow or runtime
errors. Screenshots are in `output/vendor-workspace-20260922/` (local only).
No schema migration. Local outputs, temporary work and secrets are excluded
from Vercel uploads through `.vercelignore`.
Production deployment `B5k5Lz18zRuDqHTM26hbzPmRCLHC` is Ready and aliased to
https://getgold.ae. Homepage and marketplace return 200; the gold API returns
a fresh `goldapicom` quote with the separate 10-second refresh and 60-second stale
threshold intact.

**Latest checkpoint — auditable vendor-direct payment tracking (22 Sep 2026; deployed):**
Admin → Orders now links every order to a protected payment trail showing the exact
vendor-confirmed amount, payment method, preserved payment deadline, customer payment
claim time, optional transaction reference/private proof, vendor receipt-confirmation
time and the authenticated vendor account that confirmed it. The trail calculates the
confirmation delay and flags late submissions, expired payment windows and vendor
confirmations taking more than 24 hours. Admins can report, resolve or clear payment
disputes with notes; every customer claim and dispute transition is also written to the
immutable audit log. A screenshot or reference remains evidence only and never confirms
payment—the vendor's bank-account check is authoritative.

Migration `20260922071739_admin_payment_tracking.sql` is applied to production and
recorded in migration history. Its service-only confirmation RPC has zero anon/public/
authenticated grants. Deployment `FuXNRCT5bc2rxy9cUWWsCVGPGVGo` is Ready and aliased
to https://getgold.ae. Production checks: homepage 200, protected dispute API 401 when
signed out, live gold fresh from `goldapicom`, eight tracking columns and deadline
trigger present, database lint clean. Evidence: 50/50 app tests, 23/23 integration
tests, 59 pgTAP checks, typecheck, ESLint, local build and Vercel production build pass.

**Latest checkpoint — vendor-confirmed direct payment flow (22 Sep 2026; deployed):**
Customers now submit a purchase request without paying or holding stock. Requests made
outside a store's configured Dubai working hours queue until its next opening. The vendor
must confirm availability and enter the final current selling price; only after the
customer accepts that price does the database atomically acquire stock and start the
payment window (30 minutes for Aani/bank transfer, 24 hours for enabled cash/card paths).

Aani is the preferred vendor-direct option. Vendors configure their Aani UAE mobile,
bank details and seven-day working schedule under **Vendor → Payments & hours**. Direct
payment details, exact amount and Get Gold order reference are disclosed only after price
acceptance. **I have paid** and optional screenshot/reference evidence move the order only
to `payment_verification`; only the vendor can confirm cleared funds. Fulfilment then
progresses through payment confirmed, preparing, ready, out for delivery, delivered and
completed. Customer evidence remains private and never auto-confirms payment.

Migrations `20260922053420_vendor_confirmed_payment_statuses.sql` and
`20260922053424_vendor_confirmed_payment_flow.sql` are applied to production and recorded
in its migration history. Production grants read back with zero anon/authenticated access
to the service-only working-hours table and order-transition RPCs. Deployment
`D5ADhfcZGLMoYNJnUVcekxfaTvTi` is Ready and aliased to https://getgold.ae. Live homepage
and marketplace return 200; live gold remains fresh with `source: goldapicom`. Evidence:
50/50 app tests, 23/23 isolated Auth/PostgREST/Storage integration tests, 59 pgTAP checks,
typecheck, ESLint, local/production builds and local/production schema lint all pass.

**Latest checkpoint — admin vendor export (20 Sep 2026; deployed):**
The Admin → Vendors page now has an admin-only **Export Excel CSV** action. It exports
all vendors or the selected status filter and includes application/contact details,
store count, delivery/payment/website capabilities, document count/types/filenames,
status and admin notes. CSV is UTF-8/BOM encoded so it opens cleanly in Excel. Private
document contents and signed URLs are never exported. Endpoint:
`/api/admin/vendors/export`.

**Latest checkpoint — vendor partner application (20 Sep 2026; deployed):**
`/vendor/register` now presents a premium, sectioned onboarding form for UAE jewellery
partners. It collects first/last name, title, contact details, official store name,
trade licence number/expiry, store count, emirate/address, delivery availability,
online-payment availability and website availability. Selecting Yes for a website
requires a valid link. Trade-licence and Emirates ID files are optional, upload
privately to `vendor-docs` under the vendor folder, and can also be added later from
the Documents page. New business fields are stored on `public.vendors` by migration
`20260920141129_vendor_onboarding_details.sql` and shown in admin vendor review.
46 tests, typecheck, lint and production build pass. Deployment
`2Bnji5CNPpKgVqKzW7qZhBi3prHM` is Ready and aliased to https://getgold.ae.

**Latest checkpoint — certified bullion fineness (17 Sep 2026; deployed):**
Vendor listings now support an optional certificate fineness in parts per thousand for
bars and coins (for example 995, 999 or 999.9). The exact assay is validated as a
bullion-only field, used against the 999 24K reference in live pricing, shown in
customer/vendor/admin product views, and stored in every new locked price snapshot.
Migration `20260917080705_exact_bullion_fineness.sql` is applied and verified in the
production Supabase SQL Editor; both `products.assay_fineness` and
`order_price_snapshots.assay_fineness` exist. 46 app tests, typecheck, lint and a
29-page production build pass. Vercel deployment `FFfin1n6XHayANVFa4yAUuG6Vb62` is
Ready and aliased to https://getgold.ae.

**Latest checkpoint — UAE karat coverage and transparent store rate adjustment (17 Sep 2026; deployed):**
Production now supports UAE-market 12K, 14K, 16K, 18K, 21K, 22K and 24K listings. Vendors can
enter an optional **store rate adjustment in AED per gram**, which is displayed separately from
making charge and included in the live total, Get Gold fee base, VAT and locked order snapshot.
The adjustment is capped at AED 1,000/g. Legacy `vendor_premium` values remain historical only.
The production Supabase schema migration `20260917065532_uae_karats_and_vendor_rate_adjustment.sql`
was applied and verified in SQL Editor (three adjustment columns and both karat constraints).
Deployment `AbeBySFu5uB2vdEqgzzCM6XkjCqb` is Ready at https://getgold.ae. 45 app tests,
typecheck, lint and a 29-page production build pass.

UAE gold marketplace, renamed from GoldHub. Next.js 15 (App Router) + Supabase + Tailwind, deployed on Vercel.
Customers browse listings priced live against the gold market and reserve at a locked price;
vendors list stock; delivery companies maintain verified partner profiles; admins approve businesses and listings.

**Branch: `claude/goldhub-marketplace-mvp-pYHzs`** (repo `Mohamed95Amer/Mohamed95Amer`).
All work described here is on that branch. `main` does not have it.

---

## 1. Current production state

**Latest checkpoint — vendor onboarding and advertising guardrails (17 Sep 2026; deployed):**
Deployment `6qUHYgunncRHupbk7KJGikQggzC7` is live at https://getgold.ae. Shared pricing
now ignores legacy product premiums and returns zero premium for every new quote/order.
Do not restore the charge by reading the old catalogue column. Old locked snapshots
are untouched and retain their historical receipt details.

Vendor create/edit now explicitly accepts 5% or no VAT per product, using the existing
`vat_rate_bps` column. No VAT requires a vendor declaration (audited). VAT changes remove
approved listings from sale until resubmission/approval; suspended products remain
suspended. Updates verify ownership and compare `updated_at`. Admin product review and
vendor inventory show the selection. No-VAT copy says Not charged, not an automatic
legal exemption. The existing whole-order single-rate tax model is unchanged; separate
tax treatment for independently supplied platform/delivery services still needs tax review.

Visual polish increases price/trust readability, separates fee/VAT in cards, prevents
mobile carousel-control overlap, and collapses secondary marketplace filters. Vendor
form errors now recover from network failures and show field messages. The vendor
journey is covered from public signup through authenticated onboarding, pending review,
listing creation and controlled merchandising; vendors cannot call admin advertising
endpoints. 43 app tests, the existing 20 real isolated integration tests, typecheck,
lint and production builds pass (28/28). A new onboarding/advertising isolation test
is included and should be rerun when Docker/Supabase is available. Live public and
demo-vendor form checks passed; no production product/order/identity data was changed
in testing. See `docs/DESIGN-PRICING-AUDIT-2026-09-16.md`.

**Latest checkpoint — selected UAE Heritage design (16 Sep 2026; deployed):**
Deployment `FsQVskY1jZCknoisncP4KzU5gn2A` is Ready and aliased to https://getgold.ae
and www. The owner's selected ivory/emerald/gold reference is implemented with an
editorial jewellery hero, UAE ribbon, six photo categories, three featured stores,
four transparent-price product cards and a closing story banner. Shared navigation,
footer, buttons and cards carry the theme through the marketplace. The rotating
photo/video placement stays immediately before Find your piece and now has an
explicit pause/resume control. No fabricated statistics, chain-store affiliations,
insurance promises or pretend cart were copied from the concept.

Existing catalogue gates, Ad placements, pricing, VAT, checkout and identity logic
remain intact. Store imagery comes from each store's actual catalogue and is labelled
accordingly; the hero is decorative generated brand artwork. Details and the full
artwork prompt are in `docs/UAE-HERITAGE-DESIGN.md`.

Verification: 41/41 app tests; typecheck, lint, local and Vercel builds passed (28/28
generated pages). Production reviewed at 1440px desktop and 390px mobile, including
mobile navigation, marketplace/product links, checkout opening and carousel pause.
No horizontal overflow, failed images or browser errors were observed. Live gold
still reports `goldapicom`. No order or identity session was created in these checks;
the personal live identity-to-order test remains an owner task.

**Latest checkpoint — homepage media carousel and UAE VAT (16 Sep 2026; deployed):**
Deployment `83tkL3MdNiDkxcbqdFQTK3aPCzSs` is live at https://getgold.ae. The homepage
headline is now **“Bringing the UAE gold market online.”** A rotating photo/video
showcase sits immediately before **Find your piece**; it rotates every 5.5 seconds,
has manual controls, pauses for interaction, respects reduced-motion preferences and
uses four real product listings as fallbacks. Admin `home_top` banners replace those
fallbacks when active and remain visibly labelled **Ad**. Marketing uploads now accept
JPG/PNG/WebP up to 5 MB and MP4/WebM up to 20 MB.

New orders calculate UAE VAT once on the complete order after the once-per-order
delivery charge. Ordinary products default to 5%; `products.vat_rate_bps = 0` is an
explicit path reserved for confirmed qualifying investment bullion. The exact VAT
rate, taxable amount and AED amount are locked in every new price snapshot and shown
on the product, checkout, customer order, Vendor order and admin order views. Existing
orders remain historical and were not repriced. Migration
`20260916043214_home_media_and_vat.sql` is applied and recorded in both production and
local migration history. Production readback confirmed the 500-bps product default,
image banner default and 20 MB Storage limit.

Evidence: **41 app tests, 19 real local Auth/PostgREST/Storage integration tests and
59 pgTAP assertions pass**; typecheck, ESLint, local build and both Vercel builds pass
(28/28 generated pages). The live browser confirms the rotating imagery, formatted
headline, 5% VAT line and VAT-inclusive total. `/api/gold-price/latest` remains fresh
with `source: goldapicom`; the separate 10-second refresh and 60-second stale limits
were not changed.

**Latest checkpoint — Didit connected, boarding pass removed (15 Sep 2026; deployed):**
Deployment `GJ4855ftytBCcR1rsGF3BU6xm1P9` is live at https://getgold.ae.
The owner removed the visitor boarding-pass requirement. Both Live and Sandbox visitor
workflows now use passport + passive liveness + face match, with Questionnaire disabled.
Checkout, hosted-dialog instructions, How it works, Terms and Privacy reflect this.
Both routes use core features with the organization's shared 500-per-feature monthly
free allowances. No credits were purchased and no live identity check was run.

Live Didit application `3c39eccb-daf5-4444-be53-43c53a758303`:

- Resident workflow `c98faf55-0e9e-4b98-b172-d33dd9853883` (UAE standard ID front/back).
- Visitor workflow `8acca505-fe47-48b7-87dd-5a931dbc63c9` (passport only).
- Owner-approved ACTIVE v3 webhook **Get Gold production verification updates** sends
  `status.updated` and `data.updated` to `https://getgold.ae/api/webhooks/didit`.
- Five Didit variables (existing Live API key, signing secret, live environment and
  both workflow IDs) were saved as Vercel Secret variables for Production only.
  Secrets were transferred privately and not printed, committed or copied to local env.

Didit's console test sender omits `environment`, unlike its documented real callbacks.
The handler now acknowledges probes only after HMAC/timestamp verification and matching
`X-Didit-Test-Webhook: true` plus signed `metadata.test_webhook: true`. This returns 204
before any database access, even for Approved samples. Real callbacks still require
the expected environment, session/workflow binding and expiry/consumption protections.
Two provider-sent synthetic samples (Not Started and Unicode Approved) returned 204.
Identity regression tests pass 16/16, lint/build pass, and production SSR reports
`identityVerificationAvailable: true` without boarding-pass text. Actual Live API session
creation, ID/selfie capture and real decision-to-order completion still need the owner
to test personally. See `docs/PHASE1-OWNER-CHECKLIST.md` for the remaining steps.
Node CLI deployment on this PC required `--use-system-ca`; certificate verification
remained enabled.

**Earlier checkpoint — Phase 1 hardening / custom domain (15 Sep 2026; deployed):**
Production deployment `Gbqo2rYX9Sx6uVt9NReEWw794uT8` is live at **https://getgold.ae**.
Both apex and `www` return HTTPS 200 with certificate validation. No more Tasjeel DNS
changes are needed. `NEXT_PUBLIC_SITE_URL` is now `https://getgold.ae` in Vercel's shared
Production/Preview configuration. Supabase Auth Site URL is also `https://getgold.ae`;
18 exact callback/reset URLs cover customer, vendor and delivery-company signup plus
password recovery on the apex, `www` and legacy `goldhub-three.vercel.app`. All were
verified after dashboard reload. Live canonical/social metadata and all 28 sitemap
URLs use the new domain. Public listing/store pages still work and the gold endpoint
reports fresh `goldapicom`, with separate 10-second refresh and 60-second stale limits.

Migration `20260915131642_restrict_direct_marketplace_access.sql` is applied and recorded
locally and in production. It closes legacy direct-client write grants that bypassed
the validated Next.js routes, and removes public access to raw vendor/product records
containing private columns. Owner/admin SELECT remains for Storage ownership checks.
A narrow, private SECURITY DEFINER caller-role helper fixes recursive profiles RLS:
before this fix, actual vendor Storage uploads failed with stack-depth overflow.
Do not revoke vendor SELECT wholesale or reintroduce the recursive role lookup.
Public pages use explicit server projections; gold Realtime and atomic stock RPCs remain.
Successful-auth redirects now reject backslashes/control characters as well as external
and protocol-relative URLs, covering the `/\\external-host` normalization edge case.

Current evidence: **39 app tests, 19 real local Auth/PostgREST/Storage integration tests,
54 pgTAP assertions and 55 local HTTP/SSR checks passed**. The HTTP run proves rendered
stock changes 3 → 2 after a real local RPC claim. Lint, typecheck and both local/Vercel
production builds passed (28/28 static pages). Live SQL checks verify denied direct
writes and anonymous private-row reads without mutating production user/order data.
The remaining security advisor warning is leaked-password protection, which the
dashboard confirms is Pro-plan-only; no upgrade was made. The 20 no-policy INFO findings
are intentional service-only tables with browser privileges revoked.

This paragraph is historical and superseded by the **Didit connected** checkpoint above:
Production now has Live `DIDIT_*` secrets. Never copy the local Sandbox key into Production.
Actual sandbox API simulations cover Approved,
Declined, In Review and Expired for both routes, but not hosted capture or delivered
signed webhooks. Supabase still uses its limited built-in test email service, not custom
SMTP. The Contact page's legacy `@getgold.app` mailboxes remain unverified; do not claim
they work or silently replace them with unprovisioned addresses.

See `docs/PHASE1-OWNER-CHECKLIST.md` for the exact external inputs and acceptance tests
remaining. Live identity credentials, owner/provider-assisted hosted testing, operational
email, business/privacy approval and real vendor operations remain launch gates. Phase 1
uses vendor-direct cash, card terminal or enabled bank transfer; marketplace online card
payments stay off until a PSP is contracted and tested.

**Latest checkpoint, 15 Sep 2026 (admin merchandising release; deployed):**
Admins can grant any approved Vendor a cancellable, time-limited Premium placement
from the Vendor detail screen. Promoted stores rank above the organic directory but
always carry a small **Ad** disclosure; Verified and Top Rated remain independent
trust signals. `/admin/marketing` schedules/cancels image or text banners across the
home, marketplace and Vendor directory, and schedules global Get Gold fee/delivery
discounts. Banner artwork is restricted to JPG/PNG/WebP up to 5 MB in the public
`marketing-assets` bucket. All writes require an authenticated admin or super-admin,
use the service role server-side and create audit-log records.

Seasonal fee discounts stack after the customer's first-three-order discount. Delivery
offers still charge once per delivery order and are recorded as a Get Gold-funded
Vendor credit. The campaign name, exact discount percentages, pre-discount delivery
fee and final price are snapshotted on every order so later cancellation cannot rewrite
history. Admin and Vendor order views show the resulting Get Gold fee, delivery credit
and net settlement. Migration `20260914203449_admin_marketing_controls.sql` is live.

Final evidence: 36 application tests, 15 real Auth/PostgREST integration tests, five
SQL suites / 54 pgTAP assertions, schema lint, typecheck, ESLint, 28-page production
generation and 55 HTTP/SSR checks pass. Production readback confirmed three protected
control tables, all five snapshot columns, RLS, zero anon/authenticated grants and the
5 MB public marketing bucket. Vercel deployment `CWheFwtRLa3PrbgyueZyTcWPt2Yh` is
aliased to the live URL; the home, marketplace and Vendor directory return 200 and the
live quote still reports `goldapicom`. No paid placement, banner or fee campaign was
activated by default. Production Didit credentials remain absent.

**Latest checkpoint, 15 Sep 2026 (supersedes the 14 Sep local checkpoints below; deployed):**
Phase 1 now uses vendor-direct collection: cash, the Vendor's card terminal, or an
enabled bank-transfer option. Bank instructions are snapshotted only after stock
acceptance; customer proof is private and never marks an order paid by itself. The
Vendor must confirm cleared funds. Vendors choose their own staff or an external
courier and set one delivery fee per order; collection is free. Marketplace online
payment remains visibly unavailable until a real PSP is integrated.

Vendor making-charge commission is **paused**. Customers pay a **1% Get Gold fee on
the merchandise subtotal, excluding delivery**. Each customer receives **50% off for
the first three qualifying orders**, making the effective rate 0.5%. Discount slots
are allocated server-side under a per-customer database lock, survive paid/refunded
orders, and are released by rejected, cancelled or expired unpaid orders. The exact
effective rate, AED fee, discount and promotion position are snapshotted. Migration
`20260914200048_customer_introductory_fee_discount.sql` owns this behavior.

Evidence: 35 application regression tests, 14 Auth/PostgREST integration tests,
four SQL suites / 36 pgTAP tests, schema lint, security advisors, typecheck, ESLint,
28-page production generation, and 54 HTTP/SSR checks all pass. The integration run
proves orders 1–3 use 0.5%, order 4 uses 1%, cancellation releases a slot, delivery is
not multiplied, vendor commission is zero, and available stock changes through the
real RPC. All nine pending migrations were applied to production project
`xgbzvdrdpinwkdbgpxdh`; post-migration checks confirmed the 1% standard fee,
server-only promotion functions and all 12 approved products still valid. Vercel
deployment `FgDmLca4QCvsrH5JnCGSTDisHsmJ` is aliased to the live URL. A rendered
browser pass confirmed `goldapicom`, the 0.5% fee, `50% OFF`, three remaining
orders, once-per-order delivery and a clean browser console. Production Didit
credentials are still absent, so order submission correctly remains disabled.

**Latest checkpoint, 14 Sep 2026 (supersedes older blocker notes below; not deployed):**
Docker is repaired without deleting volumes; the isolated `getgold_validation`
Supabase stack runs Postgres 17. The full migration chain, 36 pgTAP tests, database
lint and security advisors pass. There are 32 passing regression tests and 10 passing
Auth/PostgREST integration runner tests, including captured confirmation/recovery
emails, stock races, expired-payment rejection and courier ownership/proof.
The user approved delivery **once per order**; new snapshots record `per_order`,
legacy snapshots retain `per_unit`. Two additional local migrations are
`20260914095323_delivery_fee_per_order.sql` and
`20260914095534_catalogue_integrity_volatility.sql` (five pending production migrations total).
Fresh degraded quotes now fail checkout. Vendor updates use status/expiry CAS.
Stock RPC failures no longer fall back to original inventory: checkout fails closed.
Local image-host configuration now permits only the isolated product bucket in development.

The existing Didit sandbox key was securely saved in ignored `.env.local`; temporary
transfer artifacts were removed. Both actual sandbox workflows pass session creation,
authenticated environment/reference checks and Approved/Declined/In Review/Expired
API simulations. No real documents or selfies were uploaded. Hosted capture and signed
webhook delivery remain untested; webhook secret is not configured. Local Supabase
credentials are supplied privately by `npm run dev:local`.
Node's system CA store fixes this host's TLS trust failure without disabling certificate
verification (`NODE_USE_SYSTEM_CA=1` / `node --use-system-ca`). Vercel `whoami` now
succeeds as the expected account; older authentication-blocker notes are superseded.
No production database or Vercel deployment was changed during this validation.
See `docs/VALIDATION.md` and its repeatable test commands before the next release.
Final local checks: 54 HTTP/SSR checks passed, including rendered stock 3 → 2
after a real claim and another user's order being denied. Final production build,
lint and typecheck passed; npm audit reported zero known vulnerabilities.

**Local validation hardening (14 Sep 2026; not deployed):** 30 credential-free
application/route regression tests pass via `npm test`; typecheck, lint and the
production build also pass (27/27 static pages generated). Didit now requires explicit
`DIDIT_ENVIRONMENT=live|sandbox`; sandbox is restricted to a localhost app AND
localhost database, never hosted Vercel. Authenticated decision reads and signed
webhooks reject missing/mismatched environments. A new session's decision is
validated before its document-capture URL is handed to the customer. API calls
have 15-second timeouts, no redirects, and a fixed official provider origin.
Malformed webhook payloads fail safely and database failures return retryable 503s
instead of false acknowledgements. Polling no longer reports an approval after
a zero-row conditional update. Reservation creation also checks safe provider setup.

Courier updates now compare the previous status and owner when writing, so a
conflicting tab cannot silently overwrite a completed transition. Completion
requires a separate proof-of-delivery reference, with clear guidance not to enter
ID numbers or OTPs. Missing coordinates no longer produce a false map pin at 0,0.
Pricing rules, single-provider polling, atomic stock claims, launch 0.5% fee and
disabled online payments remain unchanged.

Local Supabase configuration and `.github/workflows/getgold-validation.yml` were
added for repeatable migration/pgTAP validation (CLI 2.117.0; Postgres 17 matches
the live project's observed 17.6). Stock tests now create rollback-only synthetic
fixtures instead of selecting real inventory, and legacy assertions have pgTAP
wrappers. **The database tests and GitHub workflow have not run yet.** Docker
Desktop currently crashes on its `dockerInference` local socket during startup;
the earlier working-engine checkpoint is no longer current. No reset or data
deletion was performed. No live schema/deployment was changed. See
`docs/VALIDATION.md` for commands and the outstanding end-to-end checks.

**Live:** https://goldhub-three.vercel.app — legacy Vercel project `mohamed95amers-projects/goldhub`.

**Deployment status (11 Sep 2026):** application commit `1a624c5` is manually deployed to the existing
production project and aliased to the live URL. The marketplace is publicly branded **Get Gold**, with the
tagline “See the price. Get the gold.” The local and Vercel 41-page production builds, typecheck,
lint, public-route smoke checks and live visual pass are clean. `NEXT_PUBLIC_SITE_URL` now points to
the real `goldhub-three.vercel.app` deployment; it previously generated canonical and social links
to an unrelated Persian site at `goldhub.vercel.app`.

**Pending verified release (13 Sep 2026):** branch commit `973b6d5` contains the Didit integration,
and commit `2cc3a2e` upgrades the framework from vulnerable Next.js `14.2.15` to the patched
`15.5.24` maintenance line. A clean `npm ci`, full dependency audit, typecheck, ESLint run and
41-page production build all pass; the dependency audit reports zero known vulnerabilities. The
signed Didit webhook probe also passes both accepted-signature paths and rejects stale and forged
requests. This release is not on the live URL yet: Vercel authentication has expired, and the Didit
credentials plus migration `20260912102501_allow_didit_identity_provider.sql` are still pending.

**Marketplace-liquidity release (13 Sep 2026):** the branch now also contains migration
`20260912224153_marketplace_liquidity_requests.sql`. It adds a strict listing-integrity gate,
45-day configurable inventory confirmations, hides stale/invalid/empty listings from every public
discovery and reservation path, buyer requests with private reference images and itemized vendor
offers, no-hold store-visit leads, a managed 10–20-product catalogue-onboarding workflow, vendor and
admin liquidity reporting, and a provider-ready payment preference. The customer can see online
checkout as a future option, but both the UI and API fail closed until a real PSP adapter exists;
direct payment to the seller is the only executable payment path. Typecheck, ESLint and the full
Next.js 15 production build pass. The new pgTAP coverage is in
`supabase/tests/marketplace_liquidity_test.sql`, but Docker is not running locally, so the migration
and its SQL tests have not made a PostgREST/Postgres round trip. Apply and verify the migration
before deploying the application release.

**Growth and delivery release (13 Sep 2026):** migration
`20260912235331_growth_delivery_experience.sql` and its application changes add saved listings,
target-total and making-promotion alerts, four-item live comparison, in-app notifications and
channel preferences, English/Arabic navigation with RTL layout, referral attribution, indexed
full-text catalogue search plus weight/emirate/budget/certificate filters, licence-expiry gating,
a privacy-minimal 30-day conversion dashboard, linked buyer-request offers that can continue into
the ordinary identity/stock-lock checkout, and an explicit courier assignment state machine. Pay-at-store
orders can now be marked paid by the seller, activating purchase insights and referral conversion.
The PWA service worker caches only static framework/icon assets; documents, live-price endpoints
and all APIs remain network-only. External email/SMS/WhatsApp preferences are stored but those
channels do not claim delivery until a real provider is connected. Online payment remains visible
but fails closed until a regulated marketplace PSP is implemented.

Price alerts are processed by `/api/cron/process-price-alerts` behind the existing `CRON_SECRET`
boundary and also by the daily maintenance cron. Vercel Hobby is intentionally not given another
high-frequency job; connect a free external scheduler during validation if alerts should run more
often than daily. Each alert is evaluated at most every five minutes and notification writes are
deduplicated.

Typecheck, ESLint and four full Next.js production builds pass. The 20-assertion pgTAP regression is
in `supabase/tests/growth_delivery_experience_test.sql`. It has not run because the Supabase
management API is unreachable from this machine and Docker Desktop's Linux engine is not running.
Do not deploy this frontend before applying, in order,
`20260912224153_marketplace_liquidity_requests.sql` and
`20260912235331_growth_delivery_experience.sql` (plus the earlier pending Didit migration). A local
runtime smoke test is also unavailable because `.env.local` contains only Vercel OIDC context, not
the Supabase runtime variables; the compiled application itself is clean.

Migrations `20260911135750_add_delivery_company_role.sql`,
`20260911135755_delivery_company_profiles.sql` and
`20260911181153_harden_get_gold_security.sql` are applied to production and recorded in migration
history. Live checks confirm RLS on delivery companies, read-only browser access to the owner's
record, no direct browser write access, contact-field-only profile updates, and no self-promotion
through `profiles.role`. The legacy security-definer view and mutable function search-path advisor
findings were also cleared. The only remaining security-advisor warning is the project-level leaked
password protection setting, which must be enabled in Supabase Auth if the selected plan supports it.

Migration `20260911183317_reservation_fulfilment_details.sql` is also applied and recorded. It adds
an order-specific delivery/collection snapshot, structured UAE address details and a precise
location pin while keeping those values inside the same row-locking stock claim.

Migration `20260911184948_mandatory_order_identity_verification.sql` is also applied to production and
recorded in migration history. It makes a fresh hosted identity result mandatory and single-use for every
new order. The branch now uses Didit instead of Sumsub and deliberately fails closed until the Didit API
key and both published workflow IDs are configured; no order can bypass the missing provider. Migration
`20260912102501_allow_didit_identity_provider.sql` must be applied with that application release.

The previously unverified production paths have now been exercised end to end:

1. `/api/gold-price/latest` returns real `goldapicom` quotes. After explicitly opting Supabase
   server reads out of the Next.js Data Cache, a preview soak stayed fresh for more than two minutes
   and advanced across seven samples beyond the 60-second stale boundary.
2. `available_quantity()` completed a real PostgREST RPC round trip. A reservation changed a
   product page from 25 available to 24 after reload.
3. All 12 demo photographs were visually matched to their listing titles, copied into the public
   `product-images` Supabase bucket under their vendor IDs, and the database now stores bucket paths.

### Deploying

```bash
git clone https://github.com/Mohamed95Amer/Mohamed95Amer.git goldhub
cd goldhub && git checkout claude/goldhub-marketplace-mvp-pYHzs
npm install
npx vercel --prod          # select the EXISTING "goldhub" project
```

Selecting the existing project matters: it already holds the Supabase credentials. A fresh project
would need all four required vars set by hand.

**The Cloudflare Pages check on PRs fails, and it is unrelated to this app.** The repo is shared by
several unrelated projects, and the Cloudflare Pages project `mohamed95amer` is configured for a
different one:

```
Build command:  exit 0
Build output:   construction-erp/website
Production branch: codex/odoo19-ui-enhancement
```

It runs no build and serves a static directory. The Get Gold branch does not contain
`construction-erp/website`, so the deploy fails on a missing output directory. That project serves
`majalops.com` from the `codex/odoo19-ui-enhancement` branch, so **do not disconnect its Git
integration** — that would break a live site. The fix applied was Settings → Branch control →
Preview branch → **None**, which stops preview builds on every branch while production keeps
deploying.

Get Gold itself deploys to Vercel and has no Cloudflare dependency.

**Repo/deploy mismatch to be aware of.** The legacy-named Vercel projects (`goldhub`, `goldhub.ae` under team
`mohamed95amers-projects`) are git-linked to `Mohamed95Amer/goldhub` — a *different* repo that this
work is **not** in, and that I had no access to. So pushing to `Mohamed95Amer/Mohamed95Amer` does
**not** trigger a deploy. Either deploy manually as above, or relink the Vercel project to this repo.

---

## 2. Environment

Four logical credentials are required; the service role can use either name below. Everything
else has a working default.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client |
| `SUPABASE_SERVICE_ROLE_KEY_CURRENT` | Preferred server-only rotation slot in Vercel. Never expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only fallback for existing local environments. Never expose. |
| `CRON_SECRET` | Guards `/api/cron/*` |

Notable optional ones:

- `GOLD_PRICE_PRIMARY_PROVIDER` — defaults to `goldapicom` (free, keyless). Alternatives
  `goldapi`, `metalpriceapi`, `metalsdev` all need a paid key. `mock` is synthetic — never primary
  in production.
- `GOLD_PRICE_REFRESH_INTERVAL_SECONDS` (default **10**) — how often the price is rechecked. This
  is the cadence shown to customers.
- `GOLD_PRICE_STALE_AFTER_SECONDS` (default **60**) — when a quote is too old to *sell* against;
  the reserve button locks.

**These two are deliberately separate and must stay that way.** They were originally the same
value, which meant the server only went upstream once a quote passed the 60s stale mark — so
however often the browser polled, the displayed price only changed once a minute. If you re-merge
them, the "updates every 10s" promise silently becomes false.

Supabase project: `xgbzvdrdpinwkdbgpxdh` (eu-central-1). It also contains leftover auth users and a
"Demo Gold Shop" vendor from an earlier app; harmless, but it is not a pristine project.

Vercel Functions are pinned to Frankfurt (`fra1`) in `vercel.json`, colocated with Supabase's
`eu-central-1` data plane. Keep them close to the database for lower latency.

All server-side Supabase clients explicitly use `cache: "no-store"` and are created per request.
Next.js 14 otherwise puts the client's internal PostgREST GET requests into its Data Cache. During
production verification that made each function keep returning the first successful gold tick it
saw; the quote looked live after deploy, then silently aged past the 60-second safety threshold.
Do not remove the custom fetch from `src/lib/supabase/server.ts`: it protects live prices, stock and
reservation history from the same stale-read failure.

---

## 3. Architecture worth knowing before you change things

### Pricing — the money path

`effective_making = making_charge × (1 − active_discount_percent ÷ 100)`

`merchandise = price_per_gram_24k_aed × karat_purity × weight + effective_making
+ certificate_fee + stone_value + vendor_premium`

`service_fee = merchandise × platform_fee_bps ÷ 10,000`

`unit_total = merchandise + service_fee + delivery_fee`

Purity: 24K = 1.0, 22K = 0.916, 21K = 0.875, 18K = 0.75 (`src/lib/pricing/calc.ts`).

The number rendered in the browser is **advisory only**. The authoritative price is recomputed
server-side in `src/lib/pricing/server.ts` at the moment of reservation and written to
`order_price_snapshots` along with the exact gold tick used. Do not let a client-supplied price
reach a write path.

Customer-facing prices are now transparent at both browsing levels:

- every product card shows the metal-only AED/g rate adjusted to that listing's karat plus its
  effective making charge, any making promotion, and certificate/assay fee when applicable;
- every product detail shows the live 24K reference, the product-karat rate, gold weight/value,
  original and discounted making, optional certificate/assay, stone/premium, Get Gold service fee,
  delivery fee and per-item total;
- service and delivery rows remain visible even when configured as AED 0.00, so an unset fee
  cannot be mistaken for a missing part of the calculation;
- the homepage and marketplace both read the same `platform_settings` fee values.

Every live-priced product also has a **Get Gold Value Score** from 0–100. The score starts at 100
and subtracts the percentage added above the product's live gold value by its effective making,
certificate/assay, vendor premium and the Get Gold service fee. Delivery and separately priced
stones (including the service-fee portion attributable to stones) are excluded so logistics or a
non-gold asset cannot distort a gold-to-gold comparison. Cards show the score and premium percent;
the product page also shows the premium in AED, gold-inclusive AED/g and the complete methodology.
The score is a price-transparency comparison, not a claim about craftsmanship, resale value or
investment performance (`src/lib/pricing/value-score.ts`).

The Phase 1 customer fee is **100 basis points (1%)** of the merchandise subtotal,
excluding delivery. Each customer receives a 50% introductory discount for the first
three qualifying orders, producing an effective rate of 50 basis points (0.5%). The
server allocates those three slots atomically and snapshots the effective rate and
discount. Vendor making-charge commission is paused. The old fixed-AED
`platform_fee_aed` column remains only for backwards compatibility.

`products.making_charge` is the undiscounted amount **for that individual listing, not the store**.
Vendors can—and usually will—set different making charges for different products in the same store.
The vendor form and inventory table make this scope explicit. A promotion uses
`making_charge_discount_percent` (0–100) and optional `making_charge_offer_ends_at`; expiration is
checked again server-side at reservation time. `certificate_fee` is separate because bullion bars
can have no making charge but still carry an assay/certificate cost. Snapshots store the original
making charge, applied discount, effective making charge and certificate fee so history remains
auditable. The demo bangle has 20% off making, the chain has free making through 11 Oct 2026, and
the two bars now show certificate/assay fees instead of making charges.

Homepage category navigation uses a real approved listing photo and live listing count for each
non-empty category. Do not replace it with the old large generic fallback drawings; the real-photo
tiles are both more trustworthy and more visually specific.

Delivery is charged once per order. Store collection sets the snapshotted delivery fee
to zero. Legacy snapshots retain their original `per_unit` basis so historical totals
are not silently rewritten.

> **Payments are still not integrated.** The checkout now records `pay_at_store` or `pay_online`,
> but `pay_online` is visibly disabled and rejected server-side even if someone changes the database
> feature flag. This is deliberate: a flag cannot substitute for a PSP adapter, signed webhooks,
> refunds and verified settlement. The lowest-custody model remains vendor-as-merchant-of-record,
> with native marketplace splitting by the regulated PSP to vendor/Get Gold/courier accounts. The
> UAE PSP contract must state who owns chargebacks, refunds, negative balances and settlement
> liability before `src/lib/payments/readiness.ts` can be made operational.

### Marketplace liquidity and catalogue integrity

- A customer can create a **Get Gold Request** with category, karat, budget, emirate, deadline and
  an optional private reference image. Only the server service role can access the private bucket;
  approved vendors receive one-hour signed URLs and can see only their own offer, not competitors’
  offer data. Accepting an offer is atomic and marks competing submitted offers declined. It is not
  yet an order or price lock.
- Product pages offer a **store visit request** for customers who want inspection. It creates no
  stock hold and no gold-price lock. Vendors confirm, decline or complete these leads from Orders.
- Vendors can request free managed onboarding for 10–20 products. Admins track that workflow in
  Catalogue support; the intent is to remove manual listing work from early supply acquisition.
- `product_integrity_issues()` is implemented in TypeScript and Postgres. Purity contradictions,
  category/title mismatch, missing descriptions/photos, invalid stock/weight, fake making-charge
  discounts and unsupported bullion/certificate fees block submission and approval. Drafts may
  remain incomplete, but they cannot progress to a sellable state.
- Vendors confirm approved inventory individually or in bulk. Listings with zero quantity, blocked
  quality metadata or an old `inventory_confirmed_at` are absent from the homepage, marketplace,
  store pages, sitemap, identity-verification start and authoritative reservation pricing.
- `/vendor` and `/admin/liquidity` report fresh listings, reservations, request offers and store-visit
  leads for the last 30 days using `vendor_liquidity_summary`.

### Live gold price

- `GoldPriceProvider` (`src/components/GoldPriceProvider.tsx`) owns **one** poll, **one** Supabase
  Realtime channel and **one** clock for the entire app. Everything reads it via `useLiveGoldPrice()`.
- **Do not call the fetching logic per-component.** Supabase returns the same channel object for a
  given name, so a second subscriber calls `.on()` against an already-subscribed channel and
  throws. Listing grids render a price per card, so this fires on any page with two products. This
  bug has already been hit once in a sibling codebase.
- `/api/gold-price/latest` refreshes on read when the tick exceeds the refresh interval. This is the
  main path — Vercel Hobby only permits daily crons, so the cron is a floor for quiet periods, not
  the mechanism. Refreshes are single-flighted (`refresh-on-read.ts`) so a traffic burst costs one
  upstream call.
- Provider responses are parsed defensively: several candidate price fields are probed, per-gram vs
  per-ounce is auto-detected by magnitude, and the result is range-checked (500–20000 USD/oz). An
  unreadable response throws → falls back to backup → tick marked `degraded`. **A degraded tick
  must never be presented as live.**

### Stock and reservations

Availability is **derived, not stored**: `products.quantity` minus unexpired holds. A `paid`
reservation holds stock permanently; a pending one holds it until `expires_at`. This makes expiry
free — no compensating write, nothing to drift.

Reservations go through `claim_reservation()` (migration `0005`), which takes `SELECT … FOR UPDATE`
on the product row before counting holds, so two customers racing for the last unit cannot both
win. **Do not replace this with a plain insert.** It returns `SETOF public.reservations`
deliberately — a bare composite return is handled inconsistently by PostgREST/`supabase-js`
`.single()`.

Migration `20260911183317` extends that same function with optional fulfilment arguments; it does
not introduce a second insert path. Delivery orders require recipient name/phone, emirate, area,
street/building and either a latitude/longitude pair or an HTTPS Maps pin. Existing and new store-
collection orders use the same atomic claim with no delivery address. Address data is an immutable
order snapshot visible through the reservation's existing customer/vendor/admin authorization
boundary; delivery-company order assignment and access remain intentionally unimplemented.

### Mandatory per-order buyer identity

- Every new order has its own `order_identity_verifications` row. The row contains only Get Gold
  user/product IDs, resident-or-visitor route, provider reference, pass/fail state, expiry and
  consumption timestamps. It contains no Emirates ID image, passport, boarding pass, document
  number, selfie, video or biometric template.
- The **UAE resident** Didit workflow must require an ID Verification step restricted to UAE ID
  cards (front and back), followed by Passive Liveness and Face Match 1:1.
- The **visitor** Didit workflow requires a passport plus Passive Liveness/Face Match.
  On 15 September 2026 the owner removed the boarding-pass requirement. The paid Questionnaire
  step is disabled in both Live and Sandbox visitor workflows; do not re-enable it.
- The customer chooses the route before checkout. `POST /api/identity-verifications/start` creates
  a unique vendor-data reference and returns Didit's hosted verification URL. The UI embeds it and
  also provides a new-tab fallback for mobile camera access.
- A full-payload HMAC-SHA256 Didit webhook updates the local result. The authenticated decision API
  is polled as reconciliation if a webhook is delayed. The browser can never approve itself.
- `claim_reservation()` locks the identity row, verifies that it is approved, unexpired, belongs
  to the current user and product, and consumes it in the same transaction as the stock claim.
  This is intentionally one check per order—not reusable account KYC.
- Configure `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_RESIDENT_WORKFLOW_ID` and
  `DIDIT_VISITOR_WORKFLOW_ID`; `DIDIT_API_URL` defaults to `https://verification.didit.me`.
  Create a v3 webhook destination at `/api/webhooks/didit` subscribed to `status.updated` and
  `data.updated`, then keep the returned destination secret server-only.
- Checkout fails closed while provider configuration is missing. Do not add a demo pass button or
  accept the hosted page's client state as proof. Test approved, declined, in-review and expired
  outcomes for both routes in Didit Sandbox before enabling live sessions.
- Didit's free allowance is 500 checks per month for each core feature, shared across all
  workflows in the organization. Both routes use ID verification, passive liveness and face
  match; neither includes the separately billed Questionnaire step. No live checks were run.

### Didit sandbox setup checkpoint

**Didit sandbox configuration (13 Sep 2026):** the Get Gold organization now exists.
Using the user's signed-in browser, both workflows were published in sandbox application
`fc5c0550-75e9-4ca6-95c1-0813b92853f1` (organization
`ae311b5c-e956-47b2-b882-590cac851b03`). The console explicitly confirms that test mode
uses simulated checks, costs no credits, and does not affect production.

- Resident workflow `9ee4bb30-4f69-47a7-9d8d-3eb353f7629c`, named
  **Get Gold — UAE Residents — Test**: only UAE national ID cards; standard ID-card
  subtype (not digital or diplomatic IDs); front and back required; expired IDs rejected;
  passive liveness and face match enabled. The saved editor confirms one accepted country
  and includes the back-side capture step.
- Visitor workflow `6fff2fa4-493f-4aca-bf51-ee50fb351128`, named
  **Get Gold — Visitors — Test**: passport only for Didit's supported passport countries;
  other document types, non-document lookups and wallets disabled; expired passports
  rejected; passive liveness and face match enabled. The Questionnaire step was disabled on
  15 September at the owner's request. The old boarding-pass questionnaire remains as an
  unused saved form; visitors no longer upload it or require its manual review.
- Both flows leave optional checks (AML, NFC, phone, email, etc.) disabled for this technical
  sandbox setup. This is not a production compliance sign-off.
- The API Keys page already lists an active **Primary / Sandbox** key. On the user's
  approval, the existing key was copied into private browser-session memory without
  printing it, and the clipboard was restored. The attempted loopback-only transfer was
  blocked by Opera (`ERR_BLOCKED_BY_CLIENT`); no key was saved, no security settings were
  changed, and the temporary import server and script were removed. The private in-memory
  copy was cleared after the attempt. No new key, webhook or verification session was created.
- The Git-ignored, untracked `.env.local` now has both sandbox workflow IDs, the Didit API
  base URL, a localhost callback and an **empty** `DIDIT_API_KEY=` line for the user to fill
  directly. Its prior Vercel OIDC context was preserved. No production environment changed.
  Credential wiring and end-to-end status/webhook tests remain pending. Never put sandbox
  credentials into the public production checkout or treat simulated approval as real KYC.
- Docker's Linux engine is now running (29.6.2), removing the earlier local-engine blocker.
  The three pending migrations and their SQL/runtime tests still have not been run in this
  setup checkpoint; local Supabase runtime configuration is still missing.

### Verified store reviews and reputation

- Only a customer with a `paid` reservation can review, and each reservation can create one review.
  `set_verified_review_context()` derives the customer, vendor and product from that reservation
  inside Postgres; the browser cannot choose them. Unpaid-order rejection and context derivation
  were both exercised against the live database in a rolled-back transaction.
- Buyers rate the store experience, product, communication, fulfilment and packaging, with an
  optional delivery rating. Delivery is shown separately and excluded from the store average so a
  courier problem does not silently damage the jeweller's score. Buyers have 14 days to edit.
- Vendors may post one public reply and update it. Customers cannot delete or overwrite the reply.
  Review/report writes are server-only, rate-limited and audit-logged. Direct Data API grants are
  deliberately revoked from `anon` and `authenticated`; RLS remains enabled as a second boundary.
- Customers can report spam, misleading content, abuse or personal information. Reports do not
  affect badges merely because they were filed: an admin must mark one `actioned`. Admins can hide
  the review or vendor reply, dismiss a report, or action it from `/admin/reviews`.
- `vendor_reputation_summary` calculates a Bayesian adjusted rating using a 4.2 prior with weight
  10, plus 90-day response and fulfilment signals. This stops a new shop with one five-star review
  outranking an established shop with many verified reviews.
- Badges are earned, not hand-assigned: **Top Rated** requires 20+ reviews, adjusted rating ≥4.7,
  fulfilment ≥95%, cancellations ≤2% and no actioned incidents in 90 days; **Fast Responder**
  requires 5+ responses, ≥90% response rate and ≤2-hour average; **Reliable Fulfilment** requires
  20+ resolved orders, ≥95% fulfilment and ≤2% cancellations; **New Verified** is available during
  the first 180 days while the shop has fewer than 20 reviews.
- Public product cards, product detail, vendor directory and vendor profiles all show the rating
  and eligible badges. Product/vendor pages show verified-purchase comments; `/vendor/reviews`
  shows the seller's performance breakdown and reply tools. The account order page is the buyer's
  review entry point.

### Signup authorization boundary

`auth.users.raw_user_meta_data` is user-controlled input. The original signup trigger cast its
`role` value directly to `user_role`, which meant a crafted direct signup could request `admin` or
`super_admin`. Migration `20260911130835_restrict_public_signup_roles.sql` replaces the trigger
function so only the non-privileged onboarding roles `vendor` and `delivery_company` are accepted;
every other public value becomes `customer`, while admin promotion remains a trusted database
operation. It also removes Data API execution grants from the trigger-only function. This is applied
and verified on the live Supabase project. The rollback-safe regression in
`supabase/tests/20260911_signup_role_security_test.sql` fires the real trigger for a forged
`super_admin` signup and legitimate vendor and delivery-company signups; all three assertions pass
and the follow-up residue check returns zero auth/profile probe rows.

### Account and business profiles

- `/profile` is the shared personal identity and security page for customers, vendors, delivery
  companies, admins and the platform owner. It edits only full name and phone; email is the Auth
  identity and role is never client-editable.
- Customers reach purchase history and market-linked savings insights at `/account`.
- Vendors keep their separate verified business record and reach inventory, orders, documents and
  reviews at `/vendor`.
- Delivery companies submit trade-licence, contact and emirate-coverage data at
  `/delivery/register`; `/delivery` shows the verified company profile and makes clear that order
  allocation is not implemented yet.
- Admins review delivery-company applications at `/admin/delivery-companies`, alongside the existing
  vendor and listing reviews. Approval does not expose orders or customer data by itself.

### Design, accessibility and discovery pass

- Responsive navigation is now a real labelled mobile menu with active states; forms use explicit
  labels, names, autocomplete hints and 44px touch targets; skip navigation, focus states and live
  status announcements cover the critical flows.
- Product imagery uses Next Image with AVIF/WebP negotiation, responsive source sizes and deliberate
  priority only for above-the-fold images. Marketplace sorting now includes total price, Value Score
  and store rating, with visible applied filters.
- Product pages include a quantity selector, live multi-item total, mobile sticky reserve action,
  share action, product structured data and complete fee transparency. The server still recomputes
  the authoritative total and calls `claim_reservation()`.
- The reserve area is now a one-page checkout: customers choose delivery or store collection,
  enter a structured UAE address, add a precise pin from device geolocation or a Maps link, and
  place the order while locking the current quote. Profile name/phone prefill when signed in.
- Customer reservation details preserve the selected fulfilment snapshot. Vendor orders show the
  recipient, address, pin and customer note before confirmation; admin orders show the method.
- Customer reservations now show a four-stage fulfilment timeline and payment-link safety guidance.
  Authentication adds password recovery, safe callback redirects, password visibility and a clear
  customer/vendor/delivery-company path.
- Public metadata now includes canonical URLs, Open Graph imagery, a manifest, robots rules, dynamic
  product/vendor sitemap entries and Product/JewelryStore structured data. Branded loading, error and
  not-found states replace framework defaults.
- Contact, trust and how-it-works copy no longer promises future operations as if live. New terms,
  privacy, delivery/collection and cancellation/refund pages explain that the vendor is seller of
  record and Get Gold does not currently take custody of customer funds.

### Product imagery

`products.images` is a jsonb array of **storage paths** (`<vendor_id>/file.jpg`) in the public
`product-images` bucket — not URLs. `publicStorageUrl()` (`src/lib/storage.ts`) expands them.
`ProductImage` prefers a real photo and otherwise draws an inline SVG of the category, so artwork
always matches the title.

`products.images` accepts either form: a storage path, or an absolute URL (which is passed through
untouched). All 12 demo listings now use Supabase Storage paths.

Vendors attach photos through `ProductImageUploader`, which uploads straight to the bucket under
`<vendor_id>/` — the path prefix the bucket write policy checks. A listing with no photo falls back
to the drawing rather than an empty frame.

---

## 3b. Demo data currently in the database

The project is seeded so every tab has content — it is a populated demo, not an
empty shell.

| | |
|---|---|
| Listings | 12 approved, all 12 with photos, covering 9 of the 10 categories |
| Vendors | 5 approved across Dubai, Abu Dhabi and Sharjah |
| Price ticks | 2,800+ usable ticks across 2 recorded calendar days as of 10 Sep 2026 |
| Reservations | 4 — two pending-status rows, one paid, one expired |
| Reviews | 1 verified demo review on the paid 1g gold-bar order; 0 reports |
| Audit log | 5 entries |

Demo logins exist for each role (`admin@getgold.app`, `vendor1..4@example.ae`,
`demo@getgold.app`). Passwords were set for the four `vendorN@example.ae`
accounts as `goldhub-demo-N`; the `@getgold.app` accounts predate this work and
their passwords are not known here.

Temporary confirmed production test accounts `test.customer@getgold.app` (customer)
and `test.admin@getgold.app` (admin, not super-admin) were created on 15 Sep 2026 at
the owner's request. Their passwords are intentionally not committed. Both logins and
their database roles were verified through Supabase Auth. Delete these two accounts
after the owner finishes testing; do not reuse them for real people or vendor data.

The original 20 seeded ticks remain labelled `source: 'manual'`; production ticks are labelled
`goldapicom`. The history/calculator page exposes the source per recorded day so a manually entered
reference cannot be mistaken for a provider-fetched quote.

### Customer insights

- `/live-price` is now the public Gold insights page: daily recorded history, coverage/range cards,
  an interactive date/weight/purity calculator and current value comparisons by karat.
- `/account` separates completed purchases, active locks and closed history. For paid reservations
  it totals captured spend, fine-gold equivalent, today's comparable value and the difference.
- Reservation details show the same comparison alongside the immutable server price breakdown.
- All comparisons update only the gold component while holding captured making, stone, premium and
  fee amounts constant. Copy explicitly says this is not a resale value, appraisal or financial advice.
- A pending status is only called active while `expires_at` is still in the future; the UI labels a
  lapsed lock as expired even if the daily cleanup cron has not updated the database row yet.

## 4. What is verified, and how

| Area | Status | Evidence |
|---|---|---|
| Schema, RLS, storage buckets, realtime | Applied | migrations `0001`–`0005`, `launch_commission_rate`, `pricing_charges_and_promotions` against the live project |
| Oversell + fulfilment + identity claim | **11/11 passed** against real rows | `supabase/tests/0005_reservation_stock_test.sql`; includes atomic address/pin persistence, single-use identity consumption and missing-ID bypass rejection |
| Price parser | **9/9 passed** | ad-hoc harness; covers real shape, per-gram scaling, string values, alternate keys, garbage, absurd values, null |
| Pricing math | Automated + checked by hand | normal, 20%-off, active/expired 100%-off and certificate-only cases; fee uses discounted merchandise and excludes delivery |
| Typecheck / build | Clean on Next.js 15.5.24 | `npm run typecheck`, `npm run build` (41 pages/routes) |
| Internal links | No dead routes | all 29 routes cross-checked against every `href` |
| Lint | Clean | `npm run lint` (`eslint .`) |
| Dependency security | **0 known vulnerabilities** | fresh `npm ci`, then full `npm audit`; Next.js moved from vulnerable 14.2.15 to patched 15.5.24 |
| Didit webhook boundary | **4/4 passed locally** | valid V2 HMAC → 204, valid raw HMAC → 204, stale timestamp → 401, forged signature → 401 |
| Secrets | None committed | scanned for JWTs/service-role keys; `.env.local` is gitignored |
| Stock accounting | Correct against demo data | bangle shows 2 available of 3, one held by a pending reservation |
| Live gold fetch | **Verified** | real `goldapicom`; 7-sample, >2-minute Vercel soak stayed fresh |
| `available_quantity` RPC round trip | **Verified** | real reservation changed rendered availability 25 → 24 |
| Demo photos | **Verified and migrated** | 12/12 title match; 12/12 load from Supabase Storage |
| Gold insights | **Verified** | daily view applied, calculator exercised with multiple weights/purities |
| Verified reviews | **Verified** | paid-order context derived in Postgres; unpaid order rejected; direct anon/auth table access denied |
| Design/accessibility/SEO pass | **Deployed and smoke-tested** | `npm run typecheck`, `npm run lint`, local + Vercel `npm run build` (41 pages), public URLs returned 200; homepage and delivery signup inspected live |
| Public-signup role restriction | **Applied; 3/3 passed on real trigger** | forged admin → customer, vendor → vendor, delivery company → delivery company; transaction rolled back with zero residue |
| Four-role profile system | **Applied, deployed and live-smoke-tested** | personal profile plus customer history, vendor business, delivery-company business and admin/owner operations; protected routes redirect correctly and direct self-promotion through `profiles.role` is denied |
| Checkout guidance + delivery pin validation | **Deployed and live-smoke-tested** | checkout explains the live Didit block before data entry; required-field counter/markers render; arbitrary text is rejected as a pin; Google/Apple links or coordinates are accepted; no rate-limited third-party map iframe |
| Admin customer-fee history | **Deployed and live-smoke-tested** | current orders show their snapshotted Get Gold fee; pre-launch orders are labelled `Legacy pricing · before customer fee` and are not retroactively re-priced |

The stock test is safe against a live project — it picks fixtures from existing rows and runs inside
a transaction it rolls back.

---

## 5. Suggested next steps

1. Delivery is decided: **once per order**. Deploy the tested snapshot migration with the app.
2. Complete the two hosted Didit sandbox capture journeys and signed webhook delivery. The
   isolated local API simulations already cover approved/declined/in-review/expired outcomes for
   both routes. Keep sandbox credentials out of the public production checkout; obtain and verify
   separate live credentials and live resident/visitor workflows before accepting real orders.
3. Obtain UAE privacy/legal review for mandatory biometric processing, consent language, retention,
   cross-border or UAE-local processing, and handling of minors before accepting real orders.
4. Exercise courier assignment with one approved delivery company: assignment, acceptance,
   pickup, out-for-delivery, proof reference, completion, decline and failed-delivery retry.
5. Replace generated demo artwork with each vendor's real product photography before public launch.
6. Configure and test the `support@getgold.app`, `vendors@getgold.app` and `delivery@getgold.app` mailboxes used on Contact before launch.
7. Smoke-test customer and vendor email-confirmation plus password recovery using inboxes you
   control. The code deployment and signup-role migration are complete.
8. There is no payment integration. The vendor can confirm a pay-at-store order and later attest
   that payment was received; the vendor remains seller of record and money moves off-platform.
   This is deliberate for the MVP and is not equivalent to processor settlement evidence.
9. Connect transactional email first, then WhatsApp/SMS only after verified provider accounts and
   message templates exist. The preference UI is ready but external delivery deliberately does not
   pretend to work.

## 6. Conventions

- Real content, never lorem. Prices always through `formatAed`.
- Copy must not hardcode operational numbers. Three pages asserted "every 15–30 seconds" in prose
  and had already drifted from the configured value; they now read `env`. Do not reintroduce this.
- Comments explain *why*, particularly where a naive change would reintroduce a fixed bug.
- Server components fetch; client components are marked and kept small.
