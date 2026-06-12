# Odoo CSM Copilot — Full Audit Report

**Extension:** Odoo CSM Copilot v1.2.0 (Manifest V3, side panel)
**Audited:** 2026-06-12 · ~4,700 lines across 10 files
**Method:** live load test in headless Chrome 149 (service worker + side panel + settings probing), adapted regression-harness run in Node, plus four specialist audits (performance, AI/learning, UX/flows, security) over every file.

---

## 1. Executive summary

This is a **well-engineered pilot tool with a real workflow design** — far above typical internal-extension quality. It loads cleanly with zero console errors, has genuine CSM domain knowledge baked into its prompts, keeps all customer data on the company network (local Ollama), and ships with an actual regression test harness.

But four product claims/behaviors don't survive scrutiny:

1. **It does not learn.** Every analysis is stateless; session data is deleted right after activities are created. The only feedback loop is a Google Form — whose pre-fill is broken, so pilot feedback text is likely being silently lost.
2. **It's slow by self-infliction, not by AI.** ~9–50s scroll-scraping chatter, a wasted LLM call + 30–120s model cold-load before every plan, ~25s of robot-clicking to create activities. All three have proven faster paths *already in the codebase*.
3. **Two silent fabrication paths.** With Deep Search off it still asks the model to invent a "company profile" from the bare company name (labeled "Web Research"); the Portfolio scan silently drops accounts that don't fit the context window while reporting full coverage with LLM-computed financial totals.
4. **One destructive mislabeled feature.** The hidden bulk-reschedule tool (double-click the logo) says it moves overdue *Call* activities but actually rewrites due dates on up to **500 overdue activities of every type** — no preview, no undo.

Verdict: **keep it, fix the trust/safety items this week, then the speed items — the architecture is worth investing in.**

---

## 2. Live test results (verified in real Chrome)

| Check | Result |
|---|---|
| All 7 JS files parse | ✅ |
| Manifest references resolve, icons valid | ✅ |
| Service worker registers (headless Chrome 149) | ✅ zero runtime errors |
| Side panel renders | ✅ zero console errors |
| Empty state | ✅ "Open a subscription or Sales Order page in Odoo to get started" |
| Settings | Ollama URL (default `http://10.100.255.200:11434`), Smart model `qwen3.6` (plans/portfolio), Fast model `llama3.2` (briefs), Test Connection, Pilot Feedback form URL |
| Colleague's test harness (adapted to Node) | ✅ all prompt-hygiene tests pass: OdooBot payment-spam filter flags 5/5 spam and keeps the human note; noise never leaks into prompts; stream parser correctly reassembles Ollama `/api/chat` streams and survives garbage lines |

---

## 3. Complete flow map

**UI skeleton:** header (logo · Feedback · Settings) + 5-phase bar: **Extract → Research → Analyze → Review → Execute**.

### Entry
1. Click extension icon → side panel opens.
2. Panel classifies the active tab: Sales Order/Subscription page → auto-starts Extract; CSM dashboard URL → Portfolio Scanner; anything else → idle welcome.
3. A saved session for the same tab/path with a *finished* plan restores straight to Review (no "generated on" timestamp — stale plans look fresh).

### A. Account review flow
1. **Extract** — injects a script into your live Odoo tab: DOM-scrapes name/SO/plan/MRR/products/renewal date, *clicks your Notes tab* to expose internal notes, then overlays exact values via JSON-RPC (`sale.order` read).
2. **Extracted screen** — customer card, renewal countdown (red <60d), and two async enrichments: **DB utilization** (visibly drives your page: opens Databases tab → database dialog → Updates/Apps tabs; 6–20s of fixed sleeps) and **Quick Brief** (fast-model JSON: industry/company/pains/project/contact — auto-fires if Notes exist). One CTA: **Start Research →** (+ Deep Search toggle).
3. **Research** — live checklist: ① full chatter via scroll-and-click "Load more" (9–50s; 65s deep); ② sales history across all the partner's orders (RPC); ③ "Customer 360" — CRM opportunities incl. Lost, last 24 invoices + overdue count, contacts with departed-champion detection; ④ Deep Search only: Google-first-result website scrape + tasks/timesheets. Auto-advances.
4. **Analyze** — health re-check → fast-model "company profile" call (**even with no website text** — fabrication risk) → big prompt assembled: code-computed **Key Account Signals** (health tier, renewal urgency, days-since-contact, payment behavior, open-vs-resolved issue scan, weekend-adjusted due dates) + all collected data → smart model **streams** the markdown plan. "Continue to Review" appears mid-stream; "Retry" after 2 min of silence.
5. **Review** — plan summary + editable activity cards (summary + date only; notes not editable, type not changeable, "Click to expand notes" does nothing) → **"✓ Create N Activities in Odoo"**.
6. **Execute** — plan silently copied to clipboard, then a script robot-drives Odoo's Schedule Activity dialog per activity (~8–12s each: type badge, summary, month-by-month date picker, notes, Schedule). Results screen; session wiped.

### B. Portfolio Scanner (dashboard)
RPC-fetches up to 150 of your in-progress subscriptions + chatter in sequential batches (only first 120 get chatter) → one giant prompt → streamed report: **Tier 1 Act Today / Tier 2 This Week / Tier 3 Next 30 Days / Tier 4 Upsell Pipeline / Summary Stats (MRR at risk)** → Copy/Rescan. Not persisted — closing the panel loses it.

### C. Hidden: bulk rescheduler (double-click the logo)
Says "finds all overdue **Call** activities and distributes them into upcoming weekdays" with max/day (default 18). Actually: fetches up to **500 overdue activities of ALL types** (`user_id = you, date_deadline <= today` — no type filter) and bulk-writes new `date_deadline`s via RPC. No preview, no confirmation, no undo.

### D. Settings & Feedback
Settings: Ollama URL + two model fields (mostly decorative — hard-coded task routing usually wins), Test Connection (silently saves first). Feedback: form opens a pre-filled Google Form — **pre-fill uses invented field keys (`entry.name`…), so the form almost certainly opens blank while the panel clears your text and reports success.**

### The AI pipeline underneath
- 4 task types with model routing: quick_brief/portfolio → `qwen2.5-coder:7b` → `llama3.2`; analysis → `qwen3.6` (36B-class) → a community fine-tune fallback of unknown provenance.
- Temp 0.3; 16K context cap with dynamic `num_ctx` and tail-trimming to defend against Ollama's silent-truncation failure; streaming with first-token (60–90s) and stall (60s) watchdogs, 3 retries + backoff, thinking-model `think:false` handling, automatic speed-fallback 36B→7B.
- Output parsing: brace-balanced JSON scanner for briefs (no JSON mode, no type validation, no repair-retry); regex markdown parsing for plan activities (English-only patterns — conflicts with the prompt's Arabic support); **a second, weaker duplicate parser in the panel** (no weekend skip, accepts past dates) used when you click Continue mid-stream.

---

## 4. Performance audit — ranked bottlenecks

End-to-end review today: ~10 Odoo RPCs (4 redundant), 3 LLM calls + auxiliary pings, and minutes of dead time. Top items:

1. **Chatter scroll-scraping (sw:468-481)** — fixed-sleep loop, never exits early: 9.4s minimum even with tiny chatter, ~49–65s with "Load more". Fix: one `mail.message` `search_read` RPC (the pattern already exists at sw:570 for *other* orders). **9–50s → ~0.4s on every review.**
2. **Wasted profile LLM call + model cold-load (sw:984-991; ollama.js:140)** — empty-input profile call (5–30s) on the fast model, then a swap to the 36B with no `keep_alive` → frequent 30–120s cold load before the first plan token; watchdog can then silently downgrade you to the 7B after you've paid the wait. Fix: skip the call when `websiteText` is empty; add `keep_alive:'30m'`; pre-warm the plan model during research.
3. **Plan generation budget (ollama.js:64-66, 829-932)** — ~16K-token prompt + `num_predict: 2000` on a 36B = 1–3.5 min by design; worst-case 5–6 min of silence before an error. Fix: `numPredict` ~1200, per-industry prompt-table selection, surface fallback immediately; consider 7B default with 36B opt-in.
4. **Activity creation via UI automation (sw:1050-1327)** — ~7–9s per activity of choreographed clicking incl. a 130-line date-picker walker; most fragile code in the extension. Fix: `mail.activity` create RPC (reschedule.js proves the channel works). **25s → <1s.**
5. **Service-worker kill windows** — keepalive never starts during research; streaming fetch doesn't reset the idle timer; partial plan text is never persisted → closing the panel mid-generation discards minutes of completed GPU work. Fix: keepalive on all long ops; persist accumulated text every ~3s.
6. **Streaming render (app.js:371-382, 1024-1032)** — full-screen `innerHTML` rebuild ~7×/s with O(n²) markdown re-parse; resets scroll/selection so you can't read while it streams. Fix: render chrome once, update only the plan node.
7. **Google content script runs on every search you ever make (manifest:28-33)** — polls the SERP and wakes the service worker each time (which re-writes a DNR rule). Fix: inject programmatically only into extension-created tabs.
8. **DB-utilization page hijack (sw:324-411)** — 6–20s of fixed sleeps visibly driving your page. Fix: RPC the same data, or at minimum MutationObserver waits.
9. **Redundant partner-ID resolution** — 4 collectors each re-fetch the same `commercial_partner_id`. Resolve once, pass as arg.
10. **Portfolio overflow** — 150 accounts ≈ 60–75K tokens into a 16K window; per-account data is at the prompt tail so trimming deletes accounts first; sequential chatter batches; cap at 120 fabricates "no relationship — cold contact" for accounts 121–150. Fix: prefilter, chunk ~20/call, parallelize, compute stats in code.

---

## 5. AI & learning audit

**Learning verdict: there is none.** No stored reviews, no per-account memory, no few-shot from past plans, no thumbs up/down, no fine-tuning. Session state is deleted after execution; your Review-screen edits — the richest feedback signal available — are used once and discarded. The Pilot Feedback form is human-to-developer telemetry (and its pre-fill is broken). Honest description: *a stateless local-LLM pipeline with a manual feedback form.*

**Prompt quality: genuinely strong core, with gaps.**
- Strong: "NO INVENTION" rule with required `Reference:` quote per activity; ~110 lines of real playbook (health tiers + cadences, industry→module mapping, departed-champion priority, competitor flags, "never upsell into an unresolved implementation"); deterministic Key Signals computed in code; pre-computed weekend-safe due dates.
- Gaps: no few-shot exemplar (biggest cheap win, especially for the 7B fallback); rigid exactly-3 activities; "match the customer's language (English or Arabic)" vs an English-only activity parser (Arabic plan ⇒ zero activities parsed); issue-resolution scanner can false-positive "RESOLVED" on ≥2 shared common words and then *instructs* the model to omit the issue; portfolio asks the LLM to do arithmetic over up to 150 accounts; token estimator (chars/3.2) underestimates Arabic by 30–100%, re-breaking the truncation defense for exactly the Arabic-heavy accounts.

**Fabrication paths:** (1) empty-research company profile invented from the company name, labeled "Web Research"; (2) trimmed portfolio asserting full coverage with model-computed "MRR at risk".

**Input data:** rich (notes, filtered chatter, sales history, CRM opps incl. Lost, invoices+overdues, contacts/champions, users/utilization, modules, projects/tasks/timesheets, optional website text) — but missing the systems of record the playbook itself cites: **helpdesk tickets** (open issues are inferred from chatter regex instead), **MRR/contract trend** (`sale.order.log`), invoice aging amounts, NPS/meeting history; `end_date` vs `next_invoice_date` conflated into one "renewal"; DOM-scraped chatter dates ("3 days ago") NaN silently, degrading days-since-contact.

**LinkedIn enrichment is dead code:** not in the manifest, no host permission, never injected, message types unhandled. What exists live is Google-first-result website scraping only — which is also an unguarded indirect-prompt-injection channel (arbitrary website text → model → output auto-typed into Odoo).

---

## 6. Output quality & UX

**What's good:** ~3 clicks to value on the happy path; Trigger/Ask/Reference notes are dial-from-it quality; renewal urgency is first-class; review-before-write keeps the human in the loop.

**P0 — misleading or destructive**
1. Reschedule tool: mislabeled scope (all types, not Calls), up to 500 bulk writes, no preview/confirm/undo (reschedule.js:42-51, app.js:1250).
2. Feedback form pre-fill broken → pilot feedback text silently lost (app.js:755-787).
3. Extraction failure renders the welcome screen with no error (app.js:149-169/1165).
4. No cancel anywhere; Retry double-streams (two live generations overwrite each other's text) (app.js:392-401, 811-821, 1028-1031).
5. Live-page puppeteering with no "don't touch the tab" warning; one stray click breaks it.
6. Reschedule "Back" restores an innerHTML snapshot → every button on the restored screen is dead (app.js:1339-1340).

**P1 — daily value leaks**
7. Plan is nearly impossible to keep: no Copy button, session wiped after creation, portfolio never persisted, clipboard write undisclosed.
8. Notes not expandable (fake tooltip) or editable; type fixed; "+ Add" hard-coded to Phone Call — yet notes are exactly what's written into Odoo.
9. Execution progress is fake-live: all results broadcast after the whole batch (sw:1319-1321).
10. Mid-generation close loses everything; restored plans lack timestamps.
11. Ollama errors surface late; idle warning hard-codes the IP; changing the URL to a host outside `host_permissions` just fails with no warning in Settings.
12. Two divergent activity parsers (dates differ by path).
13. "Test Connection" silently saves first — failed experiments overwrite working config.

**P2 — polish:** decorative model settings; streaming view resets scroll, no elapsed-time; "12, 11, 13, 12, 11 active / 20 licensed" ping-list glitch; Portfolio gated on hard-coded `action-1592` URL; hidden double-click gate; no dark mode; stale phase bar; dead code (LinkedIn path, `PAGE_DATA_RESULT`); no low-data pre-flight warning; no first-run tour.

**Output structure gaps for a renewals manager:** no stakeholder section or "with whom" on activities (contacts are fed in but never surfaced); no owner field (playbook says "involve PM/Support" but format can't express it); always exactly 3 activities; no ARR-at-stake/upsell sizing; no per-activity success criterion; no data-coverage disclosure (thin plan looks as authoritative as a rich one); no numeric score or "what changed since last review".

---

## 7. Security audit

Overall competent MV3 hygiene: no remote code/eval, restrictive default CSP on the panel, session data in `storage.session`, no `externally_connectable`, the DNR rule is a correctly-scoped single Origin-strip for Ollama (doesn't touch cookies).

- **H1 — Whole customer dossier to a user-mutable endpoint, no allowlist.** Prompts carry internal notes, customer emails/chatter, invoices/payment state, contact emails; Portfolio sends your entire book at once. `ollamaUrl` is freely editable + synced with no intranet/RFC-1918 validation and no API key — one typo or a synced bad value silently bulk-exfiltrates. Fix: validate against an allowlist on save; document data categories; drop raw contact emails from prompts.
- **M1 — Unescaped LLM-derived `r.summary` via innerHTML** in the failed-activity list (app.js:519) — prompt-injection → HTML injection in a privileged page. Default CSP blocks inline JS (so beacon/UI-spoof, not full XSS). Fix: `esc()` it (and `sysError`). Never add `'unsafe-inline'`.
- **M2 — Customer name + SO number leave to Google** in the feedback-form prefill GET. Make context opt-in.
- **M3 — Company name to Google search** on the CSM's logged-in profile (Deep Search). Disclose.
- **M4 — Message router never validates `sender`** while handlers run `executeScript` on payload tabIds and write RPCs against payload baseUrls. Low active risk today (no externally_connectable); fix as defense-in-depth: require sender = own side panel for privileged types.
- **M5 — LinkedIn scraper: latent ToS/ban liability, currently unwired.** If ever wired it programmatically navigates the user's authenticated LinkedIn session — the exact pattern LinkedIn bans for. Delete it and the orphan `GOOGLE_LINKEDIN_RESULT` path.
- **M6 — Generic `call_kw` + session cookies = any-model read/write as the CSM.** Today's protective invariant: LLM/scraped output never reaches `call_kw` args (activities are created via UI; reschedule writes only self-fetched IDs). Preserve that invariant explicitly; add preview to bulk writes.
- **Low:** `activeTab` redundant, `tabs` reducible; SERP-controlled URL is opened+scraped with no private-IP block (intranet SSRF-ish, low payoff); DNR rule keyed to unvalidated setting; hardcoded intranet IP across 5 files + dev-path leak in `.claude/launch.json`; Google content script on all searches; the inline `onclick` handlers in error banners are dead under CSP (the dismiss button does nothing).
- **Web Store (if ever published):** needs privacy policy + data-use disclosure; remove LinkedIn scraper; disclose SERP scraping. Fine as an unpacked internal tool.

---

## 8. Consolidated enhancement roadmap

### Week 1 — trust & safety (small diffs, big risk removed)
1. Reschedule: add `activity_type` filter to match the label (or fix label), preview list + confirm. *(reschedule.js:42-51)*
2. Fix Google Form pre-fill with real `entry.<id>` keys — or POST to a Sheet endpoint; don't clear the textarea until confirmed. *(app.js:755-787)*
3. Skip the company-profile LLM call when there's no website text. *(sw:984-991)*
4. `esc()` the failed-activity summaries + sysError. *(app.js:519,526)*
5. Validate `ollamaUrl` against an intranet allowlist on save. *(app.js:604; sw:31-44)*
6. Render extraction errors in idle state; add Cancel + abort previous stream on Retry.

### Week 2–3 — speed (minutes → seconds)
7. Chatter via one `mail.message` RPC. *(replace sw:450-512)*
8. `keep_alive:'30m'` + pre-warm the plan model during research. *(ollama.js:140)*
9. Activities via `mail.activity` create RPC — also fixes page hijack, fake progress, and most execution failures. *(replace sw:1050-1327)*
10. Scope streaming re-render to the plan node; persist partial text every ~3s; keepalive during research.
11. Resolve partner ID once; parallelize independent RPCs; RPC the DB-utilization data.
12. Move the Google extractor from manifest content_script to programmatic injection into extension-created tabs only.

### Month 1 — output quality
13. Structured JSON activities via Ollama `format` + one repair-retry; delete the duplicate panel parser. Fixes Arabic plans too.
14. 1–5 activities as data justifies (drop the exactly-3 format and the `>= 4` gate); add one few-shot exemplar activity.
15. Verify each `Reference:` against source data in code; badge unverifiable ones in Review.
16. Add Stakeholders section + per-activity "with: name/role" and owner; ARR-at-stake; per-activity success criterion; data-coverage disclosure ("analyzed: chatter ✓ invoices ✓ utilization ✗").
17. Feed `helpdesk.ticket` + `sale.order.log` MRR trend into Key Signals; separate renewal date from next-invoice date; fix chatter-date parsing.
18. Portfolio: prefilter + chunk ~20 accounts/call, compute Summary Stats in code, persist results.
19. Copy buttons + "generated on" timestamps everywhere; make notes editable.

### Quarter — make "learning" true
20. Persist `{partnerId, date, plan, proposedActivities, finalEditedActivities}` instead of wiping; inject "Prior CSM Reviews of This Account" + a "what changed since last review" diff into the next plan.
21. Per-activity 👍/👎 in Review; few-shot inject accepted examples and avoid rejected patterns (the honest local-model path to "learns your style").
22. Arabic-aware token estimator; delimit website text as untrusted data in prompts.
23. Delete dead LinkedIn code; drop `activeTab`; narrow `tabs`; make Portfolio URL detection configurable; first-run tour; dark mode.

---

## 9. What's good — keep and protect

- The 5-phase pipeline with human review before any write.
- Local-only AI for customer data (right call — protect it with the H1 allowlist).
- The streaming transport: watchdogs, retries, thinking-model handling, anti-truncation guard, model fallback.
- Deterministic Key Signals + code-computed weekend-safe due dates (judgments out of the model = the best design decision here).
- OdooBot noise filtering with a real regression harness.
- The Trigger/Ask/Reference activity format and the no-invention prompt discipline.
- Task-based model routing (fast vs smart).
