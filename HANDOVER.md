# GoldHub — handover

UAE gold marketplace. Next.js 14 (App Router) + Supabase + Tailwind, deployed on Vercel.
Customers browse listings priced live against the gold market and reserve at a locked price;
vendors list stock; admins approve vendors and listings.

**Branch: `claude/goldhub-marketplace-mvp-pYHzs`** (repo `Mohamed95Amer/Mohamed95Amer`).
All work described here is on that branch. `main` does not have it.

---

## 1. Start here — the one thing that is not done

**The app has never been deployed and has never made a real network call.**

The environment this was built in has no outbound network. Everything below was verified against
the real database and by running the real code, but two things could not be exercised and must be
checked first:

1. **The gold price provider has never been called.** `api.gold-api.com` was unreachable. The
   response parser is tested 9/9 against the shapes it might receive, and a shape it cannot read
   throws so the service falls back rather than storing garbage — but the first real call happens
   on deploy. **Check `/api/gold-price/latest` reports `"source": "goldapicom"`, not `"mock"` or
   `"seed"`.** If it reads `mock`, the upstream call failed and the fallback engaged; the response
   `attempts` array in `/api/cron/refresh-gold-price` will say why.
2. **`available_quantity()` has not been exercised over PostgREST.** The SQL is tested (see §4) but
   the `supabase.rpc(...)` round trip from `products/[id]/page.tsx` has not run. It falls back to
   `products.quantity` if the RPC returns anything unexpected, so it degrades rather than crashes —
   which also means a silent failure looks like working software. Verify the count on a product
   page drops after reserving.

### Deploying

```bash
git clone https://github.com/Mohamed95Amer/Mohamed95Amer.git goldhub
cd goldhub && git checkout claude/goldhub-marketplace-mvp-pYHzs
npm install
npx vercel --prod          # select the EXISTING "goldhub" project
```

Selecting the existing project matters: it already holds the Supabase credentials. A fresh project
would need all four required vars set by hand.

**Repo/deploy mismatch to be aware of.** The Vercel projects (`goldhub`, `goldhub.ae` under team
`mohamed95amers-projects`) are git-linked to `Mohamed95Amer/goldhub` — a *different* repo that this
work is **not** in, and that I had no access to. So pushing to `Mohamed95Amer/Mohamed95Amer` does
**not** trigger a deploy. Either deploy manually as above, or relink the Vercel project to this repo.

---

## 2. Environment

Four are required; everything else has a working default.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Never expose. |
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

---

## 3. Architecture worth knowing before you change things

### Pricing — the money path

`price_per_gram_24k_aed × karat_purity × weight + making_charge + stone_value + vendor_premium
+ platform_fee + delivery_fee`

Purity: 24K = 1.0, 22K = 0.916, 21K = 0.875, 18K = 0.75 (`src/lib/pricing/calc.ts`).

The number rendered in the browser is **advisory only**. The authoritative price is recomputed
server-side in `src/lib/pricing/server.ts` at the moment of reservation and written to
`order_price_snapshots` along with the exact gold tick used. Do not let a client-supplied price
reach a write path.

> **Known product question, not a bug:** `delivery_fee` and `platform_fee` are added to the
> *per-unit* price and then multiplied by quantity, so ordering 3 items bills delivery 3×. Both
> default to 0 so nothing is wrong today. The owner was asked and has not decided. Delivery is
> almost certainly meant to be per-order.

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

### Product imagery

`products.images` is a jsonb array of **storage paths** (`<vendor_id>/file.jpg`) in the public
`product-images` bucket — not URLs. `publicStorageUrl()` (`src/lib/storage.ts`) expands them.
`ProductImage` prefers a real photo and otherwise draws an inline SVG of the category, so artwork
always matches the title.

> **The biggest remaining gap: there are no real photographs.** Every listing shows a drawing. For
> jewellery this is the main thing separating it from a shop people buy from. The uploader
> (`ProductImageUploader`) and the URL resolution are built and working, so the first vendor upload
> replaces the drawing with no code change. This could not be done from the build environment
> because every image host was blocked.

---

## 3b. Demo data currently in the database

The project is seeded so every tab has content — it is a populated demo, not an
empty shell.

| | |
|---|---|
| Listings | 12 approved, all 12 with photos, covering 9 of the 10 categories |
| Vendors | 5 approved across Dubai, Abu Dhabi and Sharjah |
| Price ticks | 20, spanning ~2 hours |
| Reservations | 3 — pending, paid, expired (so account/vendor/admin order views populate) |
| Audit log | 5 entries |

Demo logins exist for each role (`admin@getgold.app`, `vendor1..4@example.ae`,
`demo@getgold.app`). Passwords were set for the four `vendorN@example.ae`
accounts as `goldhub-demo-N`; the `@getgold.app` accounts predate this work and
their passwords are not known here.

**Two caveats on the demo data:**

1. **Photos are hosted on a third-party CDN, not in your bucket.** They were
   generated rather than photographed, and `products.images` holds absolute
   CloudFront URLs. They render fine, but if those links expire the listings
   fall back to the SVG drawings. There was no storage-upload tool available and
   the network policy blocked fetching the files to copy them across. Re-upload
   through the vendor form to move them into `product-images`.
2. **Nobody has visually confirmed the photos match their listings.** They were
   generated blind — the same egress policy blocks viewing them. Check before
   showing this to anyone who matters.

The price ticks are labelled `source: 'manual'`, not a provider id, because they
were entered at the real market rate rather than fetched. On deploy the
refresh-on-read path writes a real `goldapicom` tick over them within 10s — that
flip is the signal live pricing works.

## 4. What is verified, and how

| Area | Status | Evidence |
|---|---|---|
| Schema, RLS, storage buckets, realtime | Applied | migrations `0001`–`0005` against the live project |
| Oversell protection | **7/7 passed** against real rows | `supabase/tests/0005_reservation_stock_test.sql` |
| Price parser | **9/9 passed** | ad-hoc harness; covers real shape, per-gram scaling, string values, alternate keys, garbage, absurd values, null |
| Pricing math | Checked by hand | 277.49 × 0.916 × 12.5 + 250 + 50 = AED 3,477.26 |
| Typecheck / build | Clean | `npx tsc --noEmit`, `npm run build` |
| Internal links | No dead routes | all 29 routes cross-checked against every `href` |
| Lint | Clean | `npx next lint` — an eslint config was added; there was none, so lint used to drop you into an interactive prompt |
| Secrets | None committed | scanned for JWTs/service-role keys; `.env.local` is gitignored |
| Stock accounting | Correct against demo data | bangle shows 2 available of 3, one held by a pending reservation |
| Live gold fetch | **NOT VERIFIED** | no network egress in the build environment |
| `available_quantity` RPC round trip | **NOT VERIFIED** | Supabase MCP dropped before it could run |

The stock test is safe against a live project — it picks fixtures from existing rows and runs inside
a transaction it rolls back.

---

## 5. Suggested next steps

1. **Deploy and verify the two unverified items above.** Nothing else should be trusted until the
   price source reads `goldapicom`.
2. **Get real photographs in.** Highest visual impact by a wide margin.
3. **Decide the delivery-fee question** (§3).
4. Product detail page is finished; the remaining plain surfaces are the vendor and admin areas —
   functional, but styled to a lower standard than the customer-facing pages.
5. There is no payment integration. Reservations end at `pending_vendor_confirmation` and the
   vendor is the seller of record; money changes hands off-platform. That is by design for the MVP.

## 6. Conventions

- Real content, never lorem. Prices always through `formatAed`.
- Copy must not hardcode operational numbers. Three pages asserted "every 15–30 seconds" in prose
  and had already drifted from the configured value; they now read `env`. Do not reintroduce this.
- Comments explain *why*, particularly where a naive change would reintroduce a fixed bug.
- Server components fetch; client components are marked and kept small.
