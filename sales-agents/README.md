# Majal sales agents — setup

Everything here runs on things already paid for: a Windows PC, a Claude
subscription, a ChatGPT subscription, and Ollama running locally. No new
service, no API credits, no monthly bill.

Work through this in order. Step 3 comes before step 5 for a reason.

---

## 0. What runs where

Your PC is the runtime. That is a consequence, not a preference: a Claude or
ChatGPT **subscription** does not include API access, so the models are driven
as CLIs (`claude -p`, `codex exec`) in a desktop session. There is no key to put
on a server.

So: agents run while the machine is on. Odoo's own crons — drafting the day's
touches, sending approved mail within the cap — run wherever Odoo runs and do
not need your PC at all.

---

## 1. Get the addon onto staging

`staging.majalops.com` is live, but it is running whatever branch was last
deployed — `majal_sales_ops` is on `claude/majal-ops-sales-system-rxmcsn` and is
not there yet. Deploy that branch, then install:

```powershell
cd construction-erp\deploy\demo
docker compose run --rm majal odoo -c /etc/odoo/odoo.conf -d erp `
  -i majal_sales_ops,microsoft_outlook --stop-after-init
docker compose up -d
```

`microsoft_outlook` ships with Odoo (LGPL-3, category Hidden) and is what makes
step 3 possible. It is not a dependency of `majal_sales_ops` on purpose — the
sales module should not care who hosts your mail.

Then in Odoo: **Settings → Users**, give yourself *Majal Sales: Manager*.

## 2. Give the agents their own Odoo user

Not ceremony. The approval engine's "not the author" control only means
something if the thing that drafts and the person who approves are different
identities, and the audit trail is only readable if it can tell a machine's work
from yours.

1. **Settings → Users → New**: name `Majal Sales Agent`, login `majal-agent`.
2. Group: *Majal Sales: Agent* only. It can draft; it cannot approve or send.
3. On that user, **Account Security → New API Key**. Copy it once — Odoo will
   not show it again.

Once this user exists you can set `require_other_user` back to `True` on the two
approval rules in **Settings → Technical → Approval Rules**, and the segregation
becomes real rather than nominal.

## 3. Authenticate the domain — before any mail goes out

**Do this before step 5.** The first cold send is what sets your domain's
reputation, and a reputation lost to unauthenticated bulk mail does not come
back by apologising.

DNS is on Cloudflare (`dion` / `paityn` nameservers), mail is Microsoft 365.

**First, look at what is already there.** The website's contact form sends
through Resend from a `majalops.com` address, which means the domain was
already verified with Resend and an SPF record almost certainly exists. **A
domain may have only one SPF record.** Publishing a second one does not add to
the first — it makes both invalid, and mail from *both* senders starts failing.
Merge the includes into the single record instead.

| Type | Name | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com <keep whatever Resend include is already there> ~all` |
| CNAME | `selector1._domainkey` | the value Microsoft gives you |
| CNAME | `selector2._domainkey` | the value Microsoft gives you |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@majalops.com` |

The two DKIM values are generated per tenant — copy them from the Microsoft
Defender portal (**Email & collaboration → Policies & rules → Threat policies →
Email authentication settings → DKIM**), then enable signing for the domain
there once the CNAMEs resolve.

Two Cloudflare specifics that catch people:

- **The DKIM CNAMEs must be DNS-only — grey cloud, not orange.** Proxying them
  makes Cloudflare answer with its own record and Microsoft cannot verify the
  key.
- Start DMARC at `p=none` and read the reports for a fortnight before
  tightening. Going straight to `reject` with a half-configured SPF silently
  bins your own mail.

**The sending identity.** `support@majalops.com` is the only licensed mailbox
on the tenant, so outreach goes out from there for now — a decision taken
knowingly, not an oversight.

Two things follow from it.

**Set a display name.** Not the bare address:

```
Mohamed Amer <support@majalops.com>
```

A first cold message is read as either "a person wrote to me" or "a system sent
me something", and the display name does most of that work. From a role address
it does nearly all of it.

**Watch the inbox.** Outreach replies now land in the same place as live
customer problems. At ten sends a day that is fine. If it starts burying real
support mail, that is the signal to move — and moving is cheap:

- an **alias** on the existing mailbox is free and instant (the tenant needs
  `SendFromAliasEnabled`), or
- a **shared mailbox** is free in Microsoft 365 — no licence, up to 50GB —
  with Send As granted to the licensed account.

Either way it is one system parameter to switch, and nothing else changes.

## 4. Point Odoo at the mailbox — OAuth, not a password

Microsoft has been retiring basic authentication for SMTP across Exchange
Online. I could not confirm today exactly where `majalops.com` stands on that,
and it does not matter: **use OAuth and the question never arises.** Odoo's
`microsoft_outlook` module does both directions.

**Register an app once** in the Azure portal (**Entra ID → App registrations →
New registration**):

- Redirect URI: `https://staging.majalops.com/microsoft_outlook/confirm`
  (web platform)
- API permissions, delegated: `SMTP.Send`, `IMAP.AccessAsUser.All`,
  `offline_access`
- Create a client secret and note it before leaving the page

**In Odoo**, Settings → Technical → System Parameters:

| Key | Value |
|---|---|
| `microsoft_outlook_client_id` | the application (client) ID |
| `microsoft_outlook_client_secret` | the secret value |

Then **Outgoing Mail Servers → New**, tick the Outlook option, save, and press
the authentication link — Microsoft asks you to sign in as
`support@majalops.com` and Odoo stores a refresh token. Repeat under
**Incoming Mail Servers** for IMAP.

Incoming is not optional. It is what threads a prospect's reply back onto the
lead and stands the sequence down; without it you will keep chasing people who
already answered.

If OAuth turns out to be blocked by tenant policy, the fallback is basic SMTP
on `smtp.office365.com:587` STARTTLS with an app password — but that requires
SMTP AUTH to be enabled for the mailbox in the admin centre, and it is the
path Microsoft is closing. Try OAuth first.

**Settings → Technical → System Parameters**, for the sales module:

| Key | Value |
|---|---|
| `majal_sales_ops.sending_identity` | `Mohamed Amer <support@majalops.com>` |
| `majal_sales_ops.reply_to` | `support@majalops.com` |
| `majal_sales_ops.daily_send_cap` | `10` to start |
| `majal_sales_ops.inbound_secret` | a long random string — also set it as `MAJAL_INBOUND_SECRET` in Cloudflare Pages |

Raise the cap by about 10 a week if bounces stay near zero. Thirty a day,
hand-approved, is a healthy ceiling for one person.

**While you are in Cloudflare Pages**, set `MAJAL_INBOUND_URL` to
`https://staging.majalops.com/majal/inbound/website` and `MAJAL_INBOUND_SECRET`
to match the parameter above. That is what turns a demo request on the website
into a lead instead of an email.

## 5. Local model and CLIs

```powershell
# gpt-oss:20b is already installed and is what the scripts default to.
# qwen3-coder:30b is also present but is tuned for code — the wrong instrument
# for classifying contractors or rendering sales copy.
ollama serve
claude                   # sign in once
codex login              # sign in once, ChatGPT plan
```

## 6. Environment variables

Set these for your user (System Properties → Environment Variables), not in a
file in the repository:

```
MAJAL_ODOO_URL   = https://staging.majalops.com
MAJAL_ODOO_DB    = erp
MAJAL_ODOO_USER  = majal-agent
MAJAL_ODOO_KEY   = <the API key from step 2>
```

Social, once you have them (step 8):

```
MAJAL_LINKEDIN_TOKEN, MAJAL_LINKEDIN_URN
MAJAL_IG_TOKEN, MAJAL_IG_USER_ID
```

Check it all:

```powershell
python sales-agents\lib\preflight.py
```

It exits non-zero and tells you what is wrong. It exists because of one specific
failure: a scheduled task that finds Ollama down, does nothing, exits zero, and
reports success for three weeks.

## 7. First leads

```powershell
# 1. Pick the lead source. Majal Sales -> Configuration -> Lead Sources.
#    The module ships one per honest way a list gets built; the code below is
#    the one for the acquired vendor list. If you assemble a new list, create
#    a new source and describe how, in enough detail to be challenged on.

# 2. Dry run. Read the mapping table and the rejection table.
python sales-agents\import_leads.py crm_leads_all_details.csv --source competitor_crm

# 3. When both look right:
python sales-agents\import_leads.py crm_leads_all_details.csv --source competitor_crm --commit

# 4. Fill the gaps on the free local model.
python sales-agents\enrich_leads.py --limit 200 --commit
```

Then in Majal: **Pipeline**, sort by ICP score, open the top 20, and start
sequences. Approve the first day's drafts by hand and read every one — that is
how you find out whether the templates are right while it is still cheap.

### What the first real import does with 3,062 rows

| | rows | |
|---|---:|---|
| Imported | **1,967** | corporate addresses, de-duplicated |
| Deferred — free mail | 949 | written to `<file>.free-mail.csv`, worked via LinkedIn |
| Dropped — flagged test/noise in the file | 90 | the list already knew |
| Dropped — country not AE/SA/EG | 51 | pass `--country` to place them |
| Dropped — duplicate within the file | 5 | |

Of the 1,967, **1,935 are UAE**, 28 Saudi and 4 Egypt. Worth knowing before you
plan around it: this list is a UAE list. An Egypt-first or Saudi-first run needs
a different list, not a different filter.

**Free mail is deferred, not discarded.** `--free-mail defer` is the default and
holds gmail/hotmail/yahoo rows out of the email pipeline, writing them to a
sidecar CSV beside the original. Two reasons, and only one of them is legal: a
new sending domain is classified on who it mails first, and personal mailboxes
in the UAE and Saudi sit under stricter consent rules than corporate ones. Bring
them in later with `--free-mail include` once the domain has a sending history,
or work them through LinkedIn where a personal address is not the channel.

### Opt-out

Every message carries a one-click unsubscribe — a visible link in the footer and
the RFC 8058 headers that put a native "unsubscribe" button in Gmail and Outlook.
Both point at `/majal/unsubscribe/<token>`, which **shows a confirmation page on
GET and only acts on POST**. That is not ceremony: corporate mail scanners fetch
every link in an incoming message before the recipient sees it, so a GET that
unsubscribed would opt people out via their own employer's filter.

An opt-out is permanent and takes effect on everything at once — the flag, the
sequence, and any message already drafted or approved and sitting in tonight's
queue. It survives re-import of the same list, and it does not copy onto a
duplicated record. You can record one by hand from the lead form when somebody
asks by phone or in a reply.

The one thing the pipeline will not do is resume a sequence for someone who
opted out; `action_majal_resume_sequence` raises rather than obeys.

## 8. Social

**LinkedIn — works today.** Create an app, add the *Share on LinkedIn* product
(self-serve, no review), scope `w_member_social`, and authorise it for your own
profile. Posts go to your personal feed, which outperforms a company Page for
B2B anyway. A company Page would need Community Management API access —
manual approval, four weeks at best.

> The token lasts about **60 days** and outside the partner programme you
> refresh it by signing in again. The Analyst warns at day 50. Miss it and
> posting stops silently.

**Instagram — works today.** The account must be **Business or Creator**;
personal accounts cannot use the API at all. Create a Meta app, add your account
as an *Instagram Tester*, and keep the app in development mode — posting only to
your own account needs no App Review.

> Meta fetches the media itself, so `--media` must be a **public URL**, not a
> file path. majalops.com already serves the screenshots and the three
> walkthrough videos; use those URLs.

**TikTok — manual, and will stay that way for now.** The Content Posting API
requires a separate audit, and until it passes, every post the API creates is
forced to `SELF_ONLY` — visible to nobody. Automating it would fill the queue
with items marked published that no one can see. TikTok drafts are queued in
Majal with the caption written; you finish them in the app and press *I
published it*.

```powershell
python sales-agents\draft_posts.py `
  --source construction-erp\website\insights\approval-trails.html `
  --pillar approval_trails --count 2 --commit

python sales-agents\publish.py --all --dry-run
```

## 9. Schedule it

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-ExecutionPolicy Bypass -File C:\path\to\sales-agents\run-daily.ps1'
$trigger = New-ScheduledTaskTrigger -Daily -At 7:00am
Register-ScheduledTask -TaskName 'Majal sales daily' -Action $action `
  -Trigger $trigger -Description 'Enrich leads, publish approved social posts'
```

Logs land in `sales-agents\logs\run-<date>.log`.

---

## Your fifteen minutes

Open Majal → **My Day**. One screen:

- **Waiting for my approval** — outreach and social drafts. Read, edit, approve.
- **Prospects who replied** — a human is waiting. Same day.
- **Posts to publish by hand** — TikTok.
- **Outreach that failed to send** — usually a bad address.

Nothing reaches a contractor that you did not approve.

## The cost rule

> The brain writes the rubric and the template. The muscle applies them to every
> row.

One Claude call authors the Arabic opening; Ollama renders two thousand
personalised variants of it for nothing. `enrich_leads.py` refuses to run when
Ollama is down rather than quietly falling back to a paid tier — that refusal is
the control working, not a bug.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Preflight: muscle NOT ANSWERING | `ollama serve` is not running |
| Ollama answers but the model is missing | the scripts default to `gpt-oss:20b`; set `MAJAL_MUSCLE_MODEL` to change it |
| Microsoft rejects the SMTP login | basic auth is being retired — use the OAuth path in step 4 |
| DKIM will not verify in the Defender portal | the CNAMEs are proxied; set them to DNS-only (grey cloud) |
| Mail from the website *and* Odoo starts failing | two SPF records — there may only be one, merge the includes |
| Odoo refused these credentials | `MAJAL_ODOO_KEY` must be an API key, not a password |
| Import rejects everything as "country not recognised" | pass `--country AE\|SA\|EG` |
| Nothing sends although approved | check the daily cap and the outgoing mail server |
| Replies keep getting chased | incoming IMAP server is not configured (step 4) |
| Instagram: "needs a public URL" | pass a majalops.com URL, not a local path |
| Social posting stopped silently | LinkedIn token expired — re-authenticate |
