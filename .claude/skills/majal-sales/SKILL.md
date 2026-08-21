---
name: majal-sales
description: Run Majal's own sales pipeline — import and score leads, draft bilingual outreach, queue social posts, handle replies. Use when working on selling Majal Ops to construction contractors in the UAE, Saudi Arabia or Egypt, or when the user mentions the sales pipeline, outreach, leads, or the sales agents.
---

# Selling Majal, with Majal

Majal Ops is an Odoo-based construction and facilities platform. This skill runs
the pipeline that sells it — and it runs *inside Majal*, so the sales system is
also a live demonstration of the product.

## The shape of it

```
Windows Task Scheduler          the clock
        │
   Claude Code                  the hub — subagents, skills, this file
        ├── ollama gpt-oss:20b  MUSCLE  free, local, unlimited
        ├── codex exec          BRAIN   ChatGPT subscription
        ├── claude -p           BRAIN   Claude subscription
        ├── python scripts      LinkedIn, Instagram publishing
        └── Odoo XML-RPC        Majal — leads, drafts, approvals, history
                │
           You, in My Day       ~15 minutes: approve, edit, reject
```

Durable state lives in Odoo. Claude Code is the conductor and holds nothing.

## The cost rule — the only one to memorise

> **The brain writes the rubric and the template. The muscle applies them to
> every row.**

Claude and ChatGPT are paid for as *subscriptions*, so their budget is measured
in attention, not tokens. Spend it on two thousand rows of classification and
there is none left for the work that needs judgement.

| Work | Tier |
|---|---|
| Scoring, classifying, cleaning, extracting, translating drafts, personalising a template N times | **Muscle** — `sales-agents/lib/route.py` → Ollama (`gpt-oss:20b`) |
| Designing the rubric, authoring a template, answering a real reply, weekly strategy | **Brain** — this session, or `codex exec` |

When acting as an agent: **do not do bulk work yourself.** Running two thousand
rows through your own context is exactly the spend this design exists to avoid.
Write or run the script; read what it reports.

`enrich_leads.py` refuses to run when Ollama is down rather than falling back to
a paid tier. That refusal is the control working — do not route around it.

## The agents

| Agent | When |
|---|---|
| `majal-prospector` | A new lead CSV arrives; pipeline needs de-duplicating |
| `majal-qualifier` | Before an outreach batch; rubric needs revisiting |
| `majal-writer` | Weekly template refresh; reply rates drop |
| `majal-content` | Filling the week's social calendar |
| `majal-responder` | Any lead shows as replied — same day |
| `majal-analyst` | Once a week |

## Two rules that are not negotiable

**Nothing reaches a prospect unapproved.** Outreach and social posts inherit
`construction.approvable`; they land in the approval inbox My Day already draws.
The rendered body is stored, so what was approved is exactly what leaves.

**Provenance is required.** Majal is built by somebody who also works at Odoo.
Every managed lead records where it came from, and a constraint refuses any
source naming the employer's systems. If a user asks to import a list without
saying where it came from, ask. Do not guess.

## Honest platform limits

- **LinkedIn personal profile** — fully automated (`w_member_social`, self-serve).
  Token expires ~60 days and is refreshed by hand.
- **LinkedIn company Page** — needs partner approval, months. Not used.
- **Instagram** — automated, but Meta fetches media itself: `--media` must be a
  **public URL**. Business/Creator account only.
- **TikTok** — **not automated.** Unaudited apps have posts forced to
  `SELF_ONLY`, visible to nobody. Drafts queue in Majal; the human finishes in
  the app. Never report a TikTok item as posted.

## Pricing

Out of scope, deliberately. Every sequence has one goal: **book the commercial
meeting.** Pricing is negotiated live, by the founder. Agents do not quote.

## Where things are

| | |
|---|---|
| Addon | `construction-erp/custom-addons/majal_sales_ops/` |
| ICP rubric | `models/crm_lead.py` — module-level dicts, meant to be read |
| Templates | `data/mail_template_data.xml` |
| Sequences | `data/majal_sales_sequence_data.xml` |
| Scripts | `sales-agents/` |
| Setup | `sales-agents/README.md` |
| Product docs | `construction-erp/docs/`, `construction-erp/website/` |

See `references/icp-rubric.md` for the scoring weights and the reasoning behind
the one that looks like a bug.
