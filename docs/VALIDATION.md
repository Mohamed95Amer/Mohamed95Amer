# Get Gold validation

## Run without external credentials

```sh
npm ci
npm test
npm run lint
npm run build
npm run typecheck
```

The Node test runner compiles the actual TypeScript source using the project's
existing TypeScript dependency. It mocks only external HTTP/database boundaries;
these are **not** real Didit, PostgREST, email, payment or browser end-to-end tests.
No real identity data, API keys or external account is required.

Coverage includes pricing/discount expiry/certificates, map-pin handling, courier
transitions and ownership, concurrent delivery updates, required delivery proof,
Didit environment isolation, session binding, safe hosted URLs, signature checks,
invalid payloads, and retryable database failures. Online payment must remain off.

## Isolated database checks

Requires a working Docker Linux engine. The pinned Supabase CLI uses the distinct
local project ID `getgold_validation`, with Postgres 17 matching production's
major version. No remote project is linked by these commands.

```sh
npm run db:start
npm run test:db
```

Startup applies the complete migration chain to that local stack. Automatic seed
loading is disabled because the legacy seed assumes pre-existing auth users and
contains outdated inventory. Regression fixtures are synthetic and rolled back.
The stock suite now creates its own customer, vendor and product instead of
choosing a real product and assuming it has no existing reservations.

The GitHub workflow `.github/workflows/getgold-validation.yml` runs the application
checks and a separate local-database job. It has read-only repository permissions,
uses no production secrets, and does not deploy anything. **It has not been run
on GitHub yet.** The unrelated Cloudflare Pages integration is untouched.

## Didit safety configuration

`DIDIT_ENVIRONMENT` must explicitly be `sandbox` or `live`. Missing/unknown modes
disable verification and reservation creation. Sandbox requires both the app URL
and Supabase URL to be loopback addresses and is disallowed on hosted Vercel
deployments, including previews. Do not wire a test frontend to production data.

Provider decisions and signed webhook payloads must carry the matching
`environment`; absent or mismatched values never authorize an order. After
creating a session, Get Gold reads its authenticated decision and checks its
environment, workflow, session ID and order reference **before** returning a
document-capture URL. This prevents an accidentally configured sandbox key from
sending a real customer into simulated capture. Actual provider compatibility
still requires the two hosted sandbox journeys to be exercised.

The official [Didit sandbox guide](https://docs.didit.me/integration/sandbox-testing)
and [session decision reference](https://docs.didit.me/sessions-api/retrieve-session)
document the environment distinction. Sandbox uploads are still real uploads:
use synthetic sample documents only, never real IDs, passports or selfies.

The local `.env.local` remains ignored by Git. It now has the existing sandbox API
key, both published workflow IDs and `DIDIT_ENVIRONMENT=sandbox`. The webhook
secret is not configured. `scripts/local-runtime.cjs` obtains isolated Supabase
runtime credentials privately from the CLI; no database keys need to be saved.
Never copy this environment into Vercel production.

## Verified locally on 15 September 2026

- 35 credential-free regression tests passed.
- Full migration chain applied to isolated Postgres 17; four SQL suites / 36 pgTAP
  tests passed. Database lint and security advisors reported no issues.
- 14 integration runner tests passed using real Auth and PostgREST: signup/email
  confirmation/password recovery through Mailpit, role and ownership denial,
  once-per-order delivery, concurrent last-unit claims, stale/degraded-price
  rejection, bank-transfer proof and cleared-funds confirmation, expired vendor
  payment rejection and courier progression/proof. The same real database run proves
  the first three qualifying customer orders use 0.5%, the fourth uses 1%, a cancelled
  unpaid order releases its slot, and vendor making-charge commission remains zero.
- Real Didit sandbox API created resident and visitor sessions and authenticated
  their environment/workflow/reference. Approved, Declined, In Review and Expired
  simulations mapped correctly for both routes. This is provider API compatibility,
  **not** proof of hosted capture, biometrics or delivered webhooks.
- All 54 HTTP/SSR route checks passed, including a rendered availability change
  from 3 to 2 after a real RPC claim and denial of another user's order detail.
- Lint, typecheck and final production compilation/static generation passed
  (28/28 static pages). Dependency audit reported zero known vulnerabilities.

```sh
npm run test:integration
npm run dev:local
# Separate terminal while the local app is running:
node scripts/test-local-pages.cjs
# Opt-in, creates synthetic sessions in the actual Didit SANDBOX:
node --use-system-ca scripts/test-didit-sandbox.cjs
```

The local runtime enables Node's system CA store, preserving TLS validation. On
this Windows host, default bundled certificates caused UNABLE_TO_VERIFY_LEAF_SIGNATURE
for Didit and Vercel; using the system CA store resolved it. Never disable TLS checks.

Delivery is now once per order, as approved by the owner. Snapshot migration
`20260914095323_delivery_fee_per_order.sql` preserves legacy per-unit orders.
Migration `20260914095534_catalogue_integrity_volatility.sql` fixes the integrity
function's volatility declaration. Both were deployed on 15 September 2026.

## Outstanding evidence before release

- Complete both hosted Didit sandbox routes with approved, declined, manual-review
  and expired outcomes; test signed callback delivery and polling reconciliation.
- Complete visual browser journeys; real HTTP/SSR and PostgREST checks do not
  replace browser interaction and mobile layout checks.
- Exercise email confirmation and password recovery with local mail capture, then
  controlled live inboxes once mailboxes/SMTP are configured.
- Integrate and verify a real marketplace PSP before enabling online checkout.
- Provision real vendor inventory, operations/support and privacy/compliance review.

## Production deployment on 15 September 2026

All nine pending migrations were applied to Supabase project
`xgbzvdrdpinwkdbgpxdh`. The post-migration readback confirmed a 100-basis-point
standard fee, RLS on the promotion table, service-role-only access to its RPC and
12 valid approved products with none blocked. Vercel deployment
`FgDmLca4QCvsrH5JnCGSTDisHsmJ` was promoted to
`https://goldhub-three.vercel.app`. The live gold endpoint returned source
`goldapicom` with status `ok`; a hydrated product and checkout browser pass showed
the 0.5% rate as `50% OFF`, three remaining discounted orders and once-per-order
delivery with no browser errors. Production identity verification remains disabled
until live Didit credentials and workflows are configured.

## Docker recovery on 14 September 2026

The previous `dockerInference` socket startup crash is resolved. Only stale runtime
socket directories were renamed to timestamped backups after stopping Docker;
the engine restarted successfully. No factory reset or Docker-volume deletion was
performed. The isolated `getgold_validation` stack is now running.
