# Get Gold — what remains before real Phase 1 orders

Updated 15 September 2026. Website: https://getgold.ae

The website is deployed with **Live Didit credentials configured and the checkout
identity gate enabled**. A participant still needs to complete the actual hosted
ID/passport and selfie flow. Technical tests are not evidence of a real payment,
identity check or delivery.

## 1. Didit: account approval and a participant for the hosted test

Your Get Gold Didit organization and two sandbox workflows already exist. Do not
create another account. The sandbox API integration works, and real signed delivery
of synthetic webhook probes now passes. Actual hosted capture remains untested.
A simulated Approved result must never unlock production orders.

**Live console setup completed 15 September 2026:** application
`3c39eccb-daf5-4444-be53-43c53a758303` now has these published configurations:

- Resident workflow: `c98faf55-0e9e-4b98-b172-d33dd9853883` — UAE ID card,
  front and back, expired documents rejected, liveness and face match.
- Visitor workflow: `8acca505-fe47-48b7-87dd-5a931dbc63c9` — passport-only,
  liveness and face match. The owner removed the boarding-pass requirement on 15 September;
  the Questionnaire step is disabled in both Live and Sandbox visitor workflows.
- Old visitor questionnaire `4886c31f-03c1-4636-b24c-b048785435a9` remains saved
  but unused by the visitor flow; do not re-enable it.
- With the owner's confirmation, the v3 destination **Get Gold production verification
  updates** was created and visibly marked ACTIVE at the webhook URL below, subscribed
  to the two events below. Didit's Not Started and Unicode Approved synthetic samples
  were each delivered successfully with HTTP 204. Neither sample touched order data.

The existing Live API key, destination signing secret, environment and both workflow
IDs are now saved as Secret variables scoped only to Vercel Production. Deployment
`GJ4855ftytBCcR1rsGF3BU6xm1P9` is live at getgold.ae. Public product SSR confirms
`identityVerificationAvailable: true`. The API key has not yet been exercised by an
actual hosted customer session. No live identity check or credit purchase was performed.
Local credentials still target the existing sandbox workflows.
The [500 free monthly allowances](https://help.didit.me/getting-started/free-plan)
remain available per organization for each core feature (ID, passive liveness, face
match and device/IP analysis), shared across workflows. Both routes now use only core
features and show $0.00–$0.30 in the Live editor (zero within the remaining free allowances).
Sandbox validation is free. Publishing workflows and creating the webhook did not run checks.

Complete any approval Didit requests during your real hosted test. No paid plan or
billable add-on has been purchased.

Configured server-only Vercel variables and destination:

| Setting | Required value |
| --- | --- |
| `DIDIT_ENVIRONMENT` | `live` |
| `DIDIT_API_KEY` | Live application key, not sandbox |
| `DIDIT_RESIDENT_WORKFLOW_ID` | Published live UAE ID front/back + liveness/face-match workflow |
| `DIDIT_VISITOR_WORKFLOW_ID` | Distinct published live passport + liveness/face-match workflow |
| `DIDIT_WEBHOOK_SECRET` | Secret belonging to the Get Gold webhook destination |
| Webhook URL | `https://getgold.ae/api/webhooks/didit` |
| Events | `status.updated` and `data.updated` |

Keep keys out of chat and Git. Enter them in the provider/Vercel secret settings or
arrange an authorized secure transfer. You perform any real ID/selfie capture yourself
in the provider's hosted flow, not by sending identity documents in chat. Sandbox uses
provider-supported synthetic samples only. The remaining test is your own complete
hosted flow from checkout, followed by confirming the signed result and a controlled
order's identity consumption/stock behavior. Stop before placing an order if you only
want to test identity capture.

## 2. Email: enable a working sender and support inbox

Supabase currently reports its built-in email service is not intended for production.
The domain and redirect URLs are fixed, but this does not create a mailbox or SMTP account.

Ask Tasjeel whether your purchase includes email hosting. If it does, enable the
mailboxes you want (for example support, vendors and delivery at `getgold.ae`) and
obtain SMTP host, port, username, password and sender restrictions. Otherwise choose
an email provider/account; do not buy an upgrade merely to complete testing.

I can configure Supabase SMTP and the provider's exact DNS records once that account
is available. Only then should I replace the unverified `@getgold.app` addresses on
the Contact page. You must confirm receipt in an inbox you control for customer/vendor
signup and password recovery. We must verify links return to the intended Get Gold page.

## 3. Business and vendor operating decisions

Provide the actual legal business identity and obtain review of the existing terms,
vendor agreement and mandatory identity/biometric processing before real orders.
This checklist is not a legal or compliance sign-off. The existing agreement-revision
draft lists the unsettled terms; no agreement has been signed on your behalf.

Agree with the first vendor on:

- Who confirms stock within the displayed reservation window and handles support.
- Payment methods actually available for delivery and collection. A bank receipt
  is evidence for review, not proof of cleared funds.
- The verified bank account, if transfer is offered, and late/short/duplicate transfers.
- Delivery staff or courier, coverage, insurance, failed deliveries, returns and refunds.
- How often the vendor remits the customer Get Gold fee and how disputes are reconciled.

Current pricing: customer fee 1% of merchandise, excluding delivery; 50% off that fee
for the first three qualifying orders (effective 0.5%). Vendor making-charge commission
is paused. The vendor collects the full displayed total and remits Get Gold's fee under
the agreed process. Delivery is once per order; store collection is free.

## 4. Pilot launch acceptance

Give the first vendor's real licence, accurate product specifications/charges, stock
and authorized product photos through the onboarding flow. Demo stores/listings must
not be presented as real participating businesses. Once you finish using the demo
logins, ask me to retire the shared test accounts before private vendor data is added.

With your participant and the vendor, test one complete delivery order and one
collection order: identity, locked price and Get Gold fee, stock decrease, vendor
acceptance, direct payment confirmation, fulfilment and customer purchase history.
If bank transfer is offered, include proof upload, vendor cleared-funds confirmation
and a late-transfer case. I can inspect technical results; you/vendor must confirm
actual funds and actual delivery. No real order or transfer has been fabricated.

## Not required for this vendor-direct Phase 1

Marketplace online card processing, split payouts, paid vendor promotion and SMS/WhatsApp
automation can remain disabled. They need separately approved providers or campaigns.
Supabase leaked-password protection is an optional paid-plan enhancement; it was not
enabled because this project is on Free. See the [provider's explanation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No further Tasjeel website-routing changes are needed. Both apex and www HTTPS work.
