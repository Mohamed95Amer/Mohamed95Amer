# Webhooks

[← Index](index.md)

Majal has exactly **one** inbound webhook: Meta's WhatsApp Cloud API callback.
There is no generic outbound webhook system, no subscription API, and no way to
register a URL of your own. If you need to react to Majal events, poll on
`write_date` (see
[Conventions → Pagination](conventions.md#pagination)) or add an automated action.

Source: `custom-addons/construction_whatsapp/controllers/webhook.py`,
`models/whatsapp_account.py`, `models/whatsapp_message.py`

## Why the module exists

Odoo's own WhatsApp app is Enterprise-only. It is itself a wrapper around Meta's
Cloud API, which is free to use and bills per template message. `construction_whatsapp`
talks to that API directly so a Community deployment gets the same capability.

## `GET /whatsapp/webhook` — subscription handshake

| Property | Value |
| --- | --- |
| `type` | `http` |
| `auth` | **`public`** |
| `methods` | `GET` |
| `csrf` | `False` |
| `save_session` | `False` |

Meta calls this once when you subscribe the webhook in the Meta app console.

| Query parameter | Description |
| --- | --- |
| `hub.mode` | Must be exactly `subscribe` |
| `hub.verify_token` | Must match a `webhook_verify_token` on some `whatsapp.account` |
| `hub.challenge` | Echoed back verbatim on success |

| Outcome | Response |
| --- | --- |
| `hub.mode == "subscribe"` and the token matches | **200**, body is `hub.challenge` |
| Anything else | **403**, body `forbidden`, and a warning logged |

The token comparison uses `hmac.compare_digest` against every configured
`webhook_verify_token`. A plain `==` on a secret leaks its length and prefix
through timing; this does not.

## `POST /whatsapp/webhook` — delivery receipts and inbound replies

| Property | Value |
| --- | --- |
| `type` | `http` |
| `auth` | **`public`** |
| `methods` | `POST` |
| `csrf` | `False` |
| `save_session` | `False` |

This endpoint **writes to the database**: it advances message states and posts
inbound text into the chatter of whichever record the conversation was about.
Public and unauthenticated, that would be an open door — anyone could mark
messages read or inject text into a project's history.

So the signature is checked **before the body is even parsed**.

### Signature verification

| Header | Value |
| --- | --- |
| `X-Hub-Signature-256` | `sha256=<hex>` — HMAC-SHA256 of the raw request body under the Meta app secret |

`whatsapp.account._verify_signature(header, body)`:

1. Rejects a missing header, or one that does not start with `sha256=`.
2. Computes `hmac.new(secret, body, sha256).hexdigest()` for **every**
   `whatsapp.account.app_secret` configured.
3. Compares with `hmac.compare_digest`.

It **fails closed**: if no account has an `app_secret` set, no callback is
accepted at all. Refusing delivery receipts is a smaller problem than accepting
forged ones. Configure `app_secret` before subscribing the webhook, or every
callback returns 403.

### Response codes

| Condition | Status | Body |
| --- | --- | --- |
| Signature missing or invalid | **403** | `forbidden` |
| Body is not valid JSON | **400** | `bad request` |
| Anything else, including a handler exception | **200** | `ok` |

The 200-on-exception is deliberate. Meta retries anything that is not a 200, and
a retry storm on a payload the server cannot parse helps nobody. The exception is
logged (`WhatsApp webhook could not be processed`) and the delivery
acknowledged. **If receipts appear to be lost, check the Odoo log — the HTTP
status will not tell you.**

### Payload

Meta's standard Cloud API shape. `_handle_webhook` walks
`entry[] → changes[] → value` and processes two lists:

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "metadata": {"phone_number_id": "…"},
        "statuses": [{"id": "wamid.…", "status": "delivered"}],
        "messages": [{"from": "9715…", "id": "wamid.…",
                      "text": {"body": "On site now"}}]
      }
    }]
  }]
}
```

Everything else in the payload is ignored.

#### `statuses[]` — delivery receipts

`_apply_status(wa_message_id, status)` finds the `whatsapp.message` with that
`wa_message_id`. Unknown ids are silently ignored.

State only ever **advances**, along `queued(0) → sent(1) → delivered(2) →
read(3)`. Receipts arrive out of order — `read` can precede `delivered` — and
without this a late receipt would make a message that was read look merely
delivered. `failed` is applied unconditionally.

#### `messages[]` — inbound replies

`_record_inbound` creates a `whatsapp.message` with `direction = "in"` and
`state = "received"`, then posts the text into the chatter of the linked record.

The thread is found by **the last outgoing message to that phone number that had
a linked record** (`res_model != False`, ordered `create_date desc`). The inbound
message inherits that message's `partner_id`, `res_model`, `res_id` and
`record_name`.

> That is a heuristic, and it is worth understanding before you rely on it. If
> two different documents both sent alerts to the same number, a reply lands on
> whichever was most recent — not necessarily the one the sender meant. The
> account is resolved separately, from `value.metadata.phone_number_id`.

Phone numbers are normalised to digits only, leading `00` stripped
(`_normalise_phone`).

## Configuration

### `whatsapp.account`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | |
| `sequence` | integer | no | no | Default 10 |
| `active` | boolean | no | no | Default `True` |
| `company_id` | many2one `res.company` | yes | no | Defaults to `env.company` |
| `phone_number_id` | char | yes | no | The numeric ID Meta assigns to the sending number — **not** the phone number. Unique per company. |
| `business_account_id` | char | no | no | WhatsApp Business Account ID |
| `access_token` | char | no | no | **Secret.** `groups="base.group_system"`. Sends messages at the company's expense. |
| `webhook_verify_token` | char | no | no | **Secret.** `groups="base.group_system"`. Any string you choose; Meta echoes it during verification. |
| `app_secret` | char | no | no | **Secret.** `groups="base.group_system"`. Signs every inbound callback. |
| `api_version` | char | yes | no | Default `v21.0` |
| `webhook_ready` | boolean | — | **computed** | An app secret is set, so signed callbacks can be verified |
| `state` | selection | no | yes | `draft` / `connected` / `error` |
| `last_error` | char | no | yes | |
| `message_count` | integer | — | **computed** | |

The three secret fields carry a `groups=` attribute, so for a non-system user
they simply **do not appear** in `fields_get` or `read` — they are absent rather
than raising. Never surface them in an integration.

Public method `action_test_connection()` does a `GET` against the phone number
and sets `state`. It sends nothing.

### Setting the webhook up

1. Create a `whatsapp.account` with `phone_number_id`, `access_token`,
   `app_secret` and `webhook_verify_token`, as a system user.
2. In the Meta app console, set the callback URL to
   `https://your-host/whatsapp/webhook` and the verify token to the value from
   step 1.
3. Meta issues the `GET` handshake. A 403 means the token did not match.
4. Subscribe to the `messages` field so receipts and replies arrive.

The endpoint must be reachable from the public internet over HTTPS. It is
`auth="public"` and `save_session=False`, so it needs no cookie and creates none.

### `whatsapp.template`

Parameters are **field paths, resolved by walking relations — never evaluated as
code.** A notification template is exactly the kind of record an integrator edits
without thinking, and an `eval` there would turn that into remote code execution.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | What the template is for, in your words |
| `active` | boolean | no | no | Default `True` |
| `template_name` | char | yes | no | The exact template name registered with Meta. Case sensitive. |
| `lang_code` | char | yes | no | Language tag of the approved template, e.g. `en`. Default `en`. |
| `category` | selection | yes | no | `utility` / `marketing` / `authentication`. Default `utility` — Meta bills by category and operational alerts are the cheapest. |
| `model_id` | many2one `ir.model` | no | no | Model the parameters are read from |
| `model` | char | — | **related, stored, readonly** | `model_id.model` |
| `body_params` | char | no | no | Comma-separated field paths filling `{{1}}`, `{{2}}`… in order. Relations followed with dots: `reference, project_id.name, date_required` |
| `preview` | text | — | **computed** | What the parameters resolve to on the most recent record |

`unique(template_name, lang_code)`.

### `whatsapp.message`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `account_id` | many2one `whatsapp.account` | no | no | `ondelete="restrict"` |
| `template_id` | many2one `whatsapp.template` | no | no | `ondelete="restrict"` |
| `partner_id` | many2one `res.partner` | no | no | Recipient |
| `phone` | char | yes | no | Normalised: digits only, leading `00` stripped |
| `direction` | selection | yes | no | `out` / `in`. Default `out`. |
| `body` | text | no | no | |
| `state` | selection | yes | no | `queued` / `sent` / `delivered` / `read` / `failed` / `cancelled` / `received`. Default `queued`. Indexed. |
| `error` | char | no | yes | Truncated to 500 characters |
| `wa_message_id` | char | no | yes | Meta's `wamid.…`. Indexed. |
| `res_model` | char | no | no | The document the alert was about. Indexed. |
| `res_id` | integer | no | no | Indexed |
| `record_name` | char | no | yes | |
| `sent_on` | datetime | no | yes | |
| `attempts` | integer | no | yes | Default 0 |

Public methods: `action_retry()` (moves `failed` → `queued`) and
`action_cancel()` (moves `queued` → `cancelled`).

### How messages are sent

Queued, never sent inline. A site engineer changing the ball-in-court on an RFI
should not have their save block on Meta's API, and certainly should not have it
fail because Meta is slow. A cron (`_cron_dispatch`, batch of 100) picks up
`state = "queued"` rows that have an `account_id`.

Queueing is done with `sudo()` by the business operation, so the message log
itself stays **read-only for ordinary users** — an employee cannot hand-craft a
message to an arbitrary number at the company's expense. Do not design an
integration around creating `whatsapp.message` records directly; queue them from
the business event.

Messages with no `account_id` stay queued rather than being discarded, so
connecting an account later sends the backlog.

Send failures are recorded on the message (`state = "failed"`, `error`), never
raised into the business transaction. Meta refusing a message produces
`UserError: WhatsApp refused the message (<code>): <body>` inside `_dispatch`,
which catches it.

## Models that emit notifications

`construction_whatsapp/models/notifications.py` extends six models to queue
messages on business events: `construction.rfi`, `construction.defect`,
`construction.permit`, `maintenance.request`, `construction.meeting.action` and
`construction.approval.step`.

Those hooks are private. There is no public API to trigger a notification —
perform the business action and the notification follows.

## Monitoring delivery from an integration

```python
"""Anything that failed to send in the last day."""
failures = models.execute_kw(
    DB, uid, API_KEY, "whatsapp.message", "search_read",
    [[["state", "=", "failed"],
      ["create_date", ">", "2026-07-31 00:00:00"]]],
    {"fields": ["phone", "partner_id", "res_model", "res_id",
                "record_name", "error", "attempts"],
     "order": "id desc", "limit": 100},
)
for message in failures:
    print(message["record_name"], message["error"])
```

Note the fields you will **not** get back: `whatsapp.account.access_token`,
`app_secret` and `webhook_verify_token` are group-restricted and are omitted for
any non-system user.
