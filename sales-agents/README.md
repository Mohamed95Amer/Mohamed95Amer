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

## 1. Install the addon

```powershell
cd construction-erp\deploy\demo
docker compose run --rm majal odoo -c /etc/odoo/odoo.conf -d erp `
  -i majal_sales_ops --stop-after-init
docker compose up -d
```

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

DNS for majalops.com is on Cloudflare (the site is Cloudflare Pages), so this is
free and takes minutes. Add three records:

| Type | Name | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:<your mail host's SPF> ~all` |
| TXT | `<selector>._domainkey` | the DKIM key your mail host gives you |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@majalops.com` |

Start DMARC at `p=none` and read the reports for a fortnight before tightening
to `quarantine`. Going straight to `reject` with a misconfigured SPF silently
bins your own mail.

**Use a sending identity that is not `support@`.** Create
`mohamed@majalops.com` for outreach and leave `support@` for inbound. Cold
outreach landing in the queue you use for live customer problems buries the
problems, and a buyer replying to `support@` about a first contact has been told
something unflattering about how the company is organised.

Verify with a real send in step 7 — check the headers say SPF `pass`, DKIM
`pass`, and DMARC aligned.

## 4. Point Odoo at the mailbox

**Settings → Technical → Email → Outgoing Mail Servers** — SMTP host, port 587,
STARTTLS, `mohamed@majalops.com`, an app password if the host issues them.
Press *Test Connection*.

**Incoming Mail Servers** — IMAP for the same mailbox. This is what threads a
prospect's reply back onto the lead and stands the sequence down, so it is not
optional; without it you will keep chasing people who already answered.

**Settings → Technical → System Parameters**:

| Key | Value |
|---|---|
| `majal_sales_ops.sending_identity` | `mohamed@majalops.com` |
| `majal_sales_ops.reply_to` | `mohamed@majalops.com` |
| `majal_sales_ops.daily_send_cap` | `10` to start |

Raise the cap by about 10 a week if bounces stay near zero. Thirty a day,
hand-approved, is a healthy ceiling for one person.

## 5. Local model and CLIs

```powershell
ollama pull qwen3:8b     # the same model Majal Intelligence defaults to
ollama serve
claude                   # sign in once
codex login              # sign in once, ChatGPT plan
```

## 6. Environment variables

Set these for your user (System Properties → Environment Variables), not in a
file in the repository:

```
MAJAL_ODOO_URL   = https://your-majal-host
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
# 1. Create a lead source first, in Majal Sales -> Configuration -> Lead Sources,
#    describing honestly how the list was assembled.

# 2. Dry run. Read the mapping table and the rejection table.
python sales-agents\import_leads.py leads.csv --source public_registry

# 3. When both look right:
python sales-agents\import_leads.py leads.csv --source public_registry --commit

# 4. Fill the gaps on the free local model.
python sales-agents\enrich_leads.py --limit 200 --commit
```

Then in Majal: **Pipeline**, sort by ICP score, open the top 20, and start
sequences. Approve the first day's drafts by hand and read every one — that is
how you find out whether the templates are right while it is still cheap.

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
| Odoo refused these credentials | `MAJAL_ODOO_KEY` must be an API key, not a password |
| Import rejects everything as "country not recognised" | pass `--country AE\|SA\|EG` |
| Nothing sends although approved | check the daily cap and the outgoing mail server |
| Replies keep getting chased | incoming IMAP server is not configured (step 4) |
| Instagram: "needs a public URL" | pass a majalops.com URL, not a local path |
| Social posting stopped silently | LinkedIn token expired — re-authenticate |
