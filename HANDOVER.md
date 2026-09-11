# GoldHub — handover

UAE gold marketplace. Next.js 14 (App Router) + Supabase + Tailwind, deployed on Vercel.
Customers browse listings priced live against the gold market and reserve at a locked price;
vendors list stock; admins approve vendors and listings.

**Branch: `claude/goldhub-marketplace-mvp-pYHzs`** (repo `Mohamed95Amer/Mohamed95Amer`).
All work described here is on that branch. `main` does not have it.

---

## 1. Current production state

**Live:** https://goldhub-three.vercel.app — Vercel project `mohamed95amers-projects/goldhub`.

**Deployment status (11 Sep 2026):** commit `83e7efc` is deployed to the existing production
project and aliased to the live URL. The comprehensive design/accessibility/SEO pass passed lint,
typecheck, the local and Vercel production builds, and a live public-route smoke test. Migration
`20260911130835_restrict_public_signup_roles.sql` is ready but not yet applied to production because
the Supabase management session is not authenticated. Do not claim that signup-role protection is
live until that migration has been applied.

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

It runs no build and serves a static directory. The GoldHub branches do not contain
`construction-erp/website`, so the deploy fails on a missing output directory. That project serves
`majalops.com` from the `codex/odoo19-ui-enhancement` branch, so **do not disconnect its Git
integration** — that would break a live site. The fix applied was Settings → Branch control →
Preview branch → **None**, which stops preview builds on every branch while production keeps
deploying.

GoldHub itself deploys to Vercel and has no Cloudflare dependency.

**Repo/deploy mismatch to be aware of.** The Vercel projects (`goldhub`, `goldhub.ae` under team
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
  original and discounted making, optional certificate/assay, stone/premium, GoldHub service fee,
  delivery fee and per-item total;
- service and delivery rows remain visible even when configured as AED 0.00, so an unset fee
  cannot be mistaken for a missing part of the calculation;
- the homepage and marketplace both read the same `platform_settings` fee values.

Every live-priced product also has a **GoldHub Value Score** from 0–100. The score starts at 100
and subtracts the percentage added above the product's live gold value by its effective making,
certificate/assay, vendor premium and the GoldHub service fee. Delivery and separately priced
stones (including the service-fee portion attributable to stones) are excluded so logistics or a
non-gold asset cannot distort a gold-to-gold comparison. Cards show the score and premium percent;
the product page also shows the premium in AED, gold-inclusive AED/g and the complete methodology.
The score is a price-transparency comparison, not a claim about craftsmanship, resale value or
investment performance (`src/lib/pricing/value-score.ts`).

The launch commission is **50 basis points (0.5%)** of the merchandise subtotal. Delivery is
excluded. `platform_settings.platform_fee_bps` is authoritative; the old fixed-AED
`platform_fee_aed` column remains only for backwards compatibility. Each reservation snapshot
stores both the calculated AED fee and the exact basis-point rate used.

`products.making_charge` is the undiscounted amount. A promotion uses
`making_charge_discount_percent` (0–100) and optional `making_charge_offer_ends_at`; expiration is
checked again server-side at reservation time. `certificate_fee` is separate because bullion bars
can have no making charge but still carry an assay/certificate cost. Snapshots store the original
making charge, applied discount, effective making charge and certificate fee so history remains
auditable. The demo bangle has 20% off making, the chain has free making through 11 Oct 2026, and
the two bars now show certificate/assay fees instead of making charges.

Homepage category navigation uses a real approved listing photo and live listing count for each
non-empty category. Do not replace it with the old large generic fallback drawings; the real-photo
tiles are both more trustworthy and more visually specific.

> **Known product question, not a bug:** `delivery_fee` is added to the *per-unit* price and then
> multiplied by quantity, so ordering 3 items bills delivery 3×. It defaults to 0 so nothing is
> wrong today. The owner was asked and has not decided. Delivery is almost certainly meant to be
> per-order.

> **Payments are still not integrated.** Before implementation, choose the commercial model:
> the lowest-custody option is for each vendor to remain merchant of record and receive customer
> payments in its own PSP account, while GoldHub invoices its commission separately. Native
> marketplace splitting can automate vendor/GoldHub/courier allocation, but the UAE PSP contract
> must state who owns chargebacks, refunds, negative balances and settlement liability.

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
function so only `vendor` is accepted and every other public value becomes `customer`; admin
promotion remains a trusted database operation. It also removes Data API execution grants from
the trigger-only function. **This migration is committed code but is not production protection
until it is applied to the live Supabase project.**

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
- Customer reservations now show a four-stage fulfilment timeline and payment-link safety guidance.
  Authentication adds password recovery, safe callback redirects, password visibility and a clear
  customer/vendor path.
- Public metadata now includes canonical URLs, Open Graph imagery, a manifest, robots rules, dynamic
  product/vendor sitemap entries and Product/JewelryStore structured data. Branded loading, error and
  not-found states replace framework defaults.
- Contact, trust and how-it-works copy no longer promises future operations as if live. New terms,
  privacy, delivery/collection and cancellation/refund pages explain that the vendor is seller of
  record and GoldHub does not currently take custody of customer funds.

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
| Oversell protection | **7/7 passed** against real rows | `supabase/tests/0005_reservation_stock_test.sql` |
| Price parser | **9/9 passed** | ad-hoc harness; covers real shape, per-gram scaling, string values, alternate keys, garbage, absurd values, null |
| Pricing math | Automated + checked by hand | normal, 20%-off, active/expired 100%-off and certificate-only cases; fee uses discounted merchandise and excludes delivery |
| Typecheck / build | Clean | `npx tsc --noEmit`, `npm run build` |
| Internal links | No dead routes | all 29 routes cross-checked against every `href` |
| Lint | Clean | `npx next lint` — an eslint config was added; there was none, so lint used to drop you into an interactive prompt |
| Secrets | None committed | scanned for JWTs/service-role keys; `.env.local` is gitignored |
| Stock accounting | Correct against demo data | bangle shows 2 available of 3, one held by a pending reservation |
| Live gold fetch | **Verified** | real `goldapicom`; 7-sample, >2-minute Vercel soak stayed fresh |
| `available_quantity` RPC round trip | **Verified** | real reservation changed rendered availability 25 → 24 |
| Demo photos | **Verified and migrated** | 12/12 title match; 12/12 load from Supabase Storage |
| Gold insights | **Verified** | daily view applied, calculator exercised with multiple weights/purities |
| Verified reviews | **Verified** | paid-order context derived in Postgres; unpaid order rejected; direct anon/auth table access denied |
| Design/accessibility/SEO pass | **Deployed and smoke-tested** | `npm run typecheck`, `npm run lint`, local + Vercel `npm run build`, 17/17 public URLs returned 200; live UI inspected |
| Public-signup role restriction | **Migration ready; not applied** | `20260911130835_restrict_public_signup_roles.sql`; requires production Supabase management auth |

The stock test is safe against a live project — it picks fixtures from existing rows and runs inside
a transaction it rolls back.

---

## 5. Suggested next steps

1. **Decide the delivery-fee question** (§3).
2. Replace generated demo artwork with each vendor's real product photography before public launch.
3. Configure and test the `support@goldhub.ae` and `vendors@goldhub.ae` mailboxes used on Contact.
4. Apply `20260911130835_restrict_public_signup_roles.sql`, then smoke-test customer and vendor
   signup plus password recovery. The code deployment itself is complete.
5. There is no payment integration. Reservations end at `pending_vendor_confirmation` and the
   vendor is the seller of record; money changes hands off-platform. That is by design for the MVP.

## 6. Conventions

- Real content, never lorem. Prices always through `formatAed`.
- Copy must not hardcode operational numbers. Three pages asserted "every 15–30 seconds" in prose
  and had already drifted from the configured value; they now read `env`. Do not reintroduce this.
- Comments explain *why*, particularly where a naive change would reintroduce a fixed bug.
- Server components fetch; client components are marked and kept small.
