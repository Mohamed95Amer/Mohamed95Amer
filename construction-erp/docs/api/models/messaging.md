# Messaging

[← Models](index.md) · [← Index](../index.md)

Source: `custom-addons/construction_whatsapp/models/`

Three models: an account, a template, and a message log. The full field tables,
the send pipeline and the inbound callback are documented on one page because
they only make sense together — see [Webhooks](../webhooks.md).

This page is the model-reference summary; **[Webhooks](../webhooks.md) is the
page to read.**

## `whatsapp.account`

One Meta Cloud API phone number. `unique(phone_number_id, company_id)`.
Order `sequence, id`.

Full table: [Webhooks → whatsapp.account](../webhooks.md#whatsappaccount).

**Three fields are secrets** and carry `groups="base.group_system"`:
`access_token`, `webhook_verify_token`, `app_secret`. For a non-system user they
do not appear in `fields_get` or `read` at all — they are absent rather than
raising. Never surface them from an integration.

Company-scoped by the `Majal tenant: whatsapp.account` record rule.

## `whatsapp.template`

A message template as Meta approved it. `unique(template_name, lang_code)`.

Full table: [Webhooks → whatsapp.template](../webhooks.md#whatsapptemplate).

The important property: `body_params` holds **field paths, resolved by walking
relations — never evaluated as code**. A comma-separated list like
`reference, project_id.name, date_required` fills `{{1}}`, `{{2}}`, `{{3}}` in
order. An `eval` there would turn template editing into remote code execution,
so there is not one.

`preview` is computed and shows what the paths resolve to on the most recent
record of the template's model — useful for validating a template you created
over RPC.

## `whatsapp.message`

The message log, in and out. Order `create_date desc, id desc`.

Full table: [Webhooks → whatsapp.message](../webhooks.md#whatsappmessage).

### Read-only for ordinary users, by design

Messages are queued with `sudo()` by the business operation that caused them, so
the log itself can stay read-only for ordinary users. An employee cannot
hand-craft a message to an arbitrary number at the company's expense.

**Do not design an integration around creating `whatsapp.message` records
directly.** Perform the business action; the notification follows. The two public
methods you can call are `action_retry()` (moves `failed` back to `queued`) and
`action_cancel()` (moves `queued` to `cancelled`).

### Linking back to documents

`res_model` and `res_id` point at whatever the alert was about, and both are
indexed. That is the join for "what have we told this subcontractor about this
defect":

```python
thread = models.execute_kw(
    DB, uid, API_KEY, "whatsapp.message", "search_read",
    [[["res_model", "=", "construction.defect"], ["res_id", "=", defect_id]]],
    {"fields": ["direction", "state", "phone", "partner_id",
                "body", "sent_on", "error"],
     "order": "id"},
)
```

### State machine

`queued` → `sent` → `delivered` → `read`, plus `failed`, `cancelled` and
`received` (inbound). Delivery receipts arrive out of order, so **the state only
ever advances** — a late `delivered` receipt will not demote a message that has
already been read. `failed` is applied unconditionally.

## Models that emit notifications

`construction_whatsapp/models/notifications.py` extends six models to queue
messages on business events:

| Model | |
| --- | --- |
| `construction.rfi` | |
| `construction.defect` | |
| `construction.permit` | adds one field |
| `maintenance.request` | |
| `construction.meeting.action` | adds one field |
| `construction.approval.step` | |

The hooks are private. There is no public API to trigger a notification.

## What there is not

- No outbound webhook system. Majal does not POST to a URL of yours on any event.
- No subscription API.
- No SMS, e-mail-gateway or other channel model. E-mail is stock Odoo
  (`mail.mail`, `mail.template`), unchanged.

To react to Majal events externally, poll on `write_date`:

```python
domain = [["write_date", ">", "2026-08-01 00:00:00"]]
changed = models.execute_kw(
    DB, uid, API_KEY, "construction.defect", "search_read",
    [domain], {"fields": ["reference", "state", "write_date"],
               "order": "write_date asc, id asc", "limit": 500},
)
```

`write_date` exists on every model and is UTC. Keep the highest value you have
seen as your cursor, and order by `write_date, id` so the cursor is stable.

## AI assistant models

`majal_ai` is adjacent but not messaging. It provides `majal.ai.provider`,
`majal.ai.conversation`, `majal.ai.message` and `majal.ai.usage`.

`majal.ai.provider.api_key_encrypted` and `api_key_input` are **secrets**,
restricted to `base.group_system,majal_ai.group_ai_manager` and encrypted at rest
with `MAJAL_AI_MASTER_KEY`. `api_key_input` is compute-with-inverse and
write-only: existing keys are never displayed.

`majal.ai.conversation` exposes public methods `bootstrap()`,
`load_conversation(conversation_id)`, `archive_conversation(conversation_id)` and
`ask(question, provider_id, scope, conversation_id, project_id, equipment_id)`,
all guarded by a private `_assert_owner` — a user can only reach their own
conversations. Per-user daily request limits and per-company monthly token limits
are enforced on the provider (`daily_request_limit`, `monthly_token_limit`; zero
means no limit).

These are not documented further here: the assistant is a product feature rather
than an integration surface, and `ask()` bills against a third-party provider.
