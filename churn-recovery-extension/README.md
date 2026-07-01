# Churn Recovery Copilot

A Chrome (MV3) side-panel extension for Customer Success Managers. On an Odoo
churned/cancelled subscription page it reads the record, chatter, and previous
subscription history, then uses Google Gemini to produce a churn diagnosis, a
3-step recovery action plan, a pitch script, and a ready-to-send recovery email.

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `churn-recovery-extension/` folder.
3. Open an Odoo subscription page, click the extension icon to open the side panel.
4. Open **Settings (⚙)**, paste a Gemini API key (free at
   `aistudio.google.com/apikey`), **tick the data-sharing consent box**, and Save.

## ⚠️ Data & privacy

Running an analysis or drafting an email sends the subscription record — including
the **chatter and internal CSM notes** — to Google Gemini for processing.

- The API key is stored **on this device only** (`chrome.storage.local`); it is
  never synced across devices.
- AI features are **gated behind an explicit consent checkbox** in Settings. Do
  not enable it for data you are not permitted to share with a third-party AI
  provider. Note that free-tier Gemini usage may be used by Google to improve
  their products — use a paid/enterprise tier or a data-processing agreement if
  you handle regulated customer data (e.g. KSA PDPL).

## Learning loop (gets better on every account)

The tool improves itself from your corrections — no fine-tuning, no backend:

- **Correct & Regenerate** — on a result, type what's wrong (e.g. *"the real reason
  was price, not slow support"*) and it re-runs the AI on the **same** scraped data
  instantly (no re-scrape). Fixes *this* account.
- **Save as Learning** — distills your correction into one reusable, account-agnostic
  rule (via a small AI call) and stores it in `chrome.storage.local`. Every future
  analysis **and** email injects these rules, so each account you run makes the next
  one sharper.
- **👍/👎 + free-text feedback** — logged per account for later review.
- **Refine Email** — a feedback box on the drafted email (e.g. *"shorter and warmer"*)
  regenerates with your instruction.
- **Learned Rules screen** — view and delete anything it has learned.

Learnings live device-only and are capped (60 rules / 300 feedback entries).

## Architecture

```
manifest.json              MV3 manifest (side panel + on-demand scripting)
background/service-worker.js  Orchestrates scrape → AI → parse; message router
content/odoo-scraper.js    Single source of truth for all Odoo DOM selectors,
                           injected on demand via chrome.scripting
lib/gemini.js              Gemini REST client (streaming)
lib/prompts.js             System prompts + prompt/plan builders and parsers
lib/storage.js             Settings (storage.local) + per-tab session state
sidepanel/                 Side-panel UI (vanilla JS state machine)
```

The Odoo integration is currently **DOM scraping** — brittle across Odoo
versions. The intended next step is to move to Odoo's JSON-RPC/ORM API and to
switch the AI to structured (JSON-schema) output. See the audit/roadmap for the
full plan.

## Known limitations

- Depends on Odoo web-client CSS class names; may need selector updates on Odoo
  upgrades (all selectors live in `content/odoo-scraper.js`).
- Analysis state is per-tab and ephemeral (cleared when the tab/browser closes).
- Output is copy-paste; it does not yet write activities back into Odoo.
