// Local Ollama — OpenAI-compatible endpoint on the company network.
// No API key required. URL and model name stored in chrome.storage.sync.

async function getLlmSettings() {
  const {
    ollamaUrl       = 'http://10.100.255.200:11434',
    ollamaModel     = 'qwen3.6:latest',
    ollamaModelFast = 'llama3.2:latest'
  } = await chrome.storage.sync.get(['ollamaUrl', 'ollamaModel', 'ollamaModelFast']);
  const base = ollamaUrl.replace(/\/$/, '');
  return { ollamaUrl: base, ollamaModel, ollamaModelFast };
}

export async function ollamaAvailable() {
  // Lightweight GET to the server root — responds instantly ("Ollama is running")
  // without loading a model. A chat ping can time out on cold start while the
  // model loads into memory, showing "unreachable" even though the server is fine.
  try {
    const { ollamaUrl } = await getLlmSettings();
    const r = await fetch(`${ollamaUrl}/`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

export async function ollamaModels() {
  // Pull the live model list from the server so the floor sees whatever IT has
  // deployed; fall back to the default model if the endpoint is unavailable.
  try {
    const { ollamaUrl } = await getLlmSettings();
    const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return ['llama3.2'];
    const j = await r.json();
    const names = (j.models || []).map(m => m.name).filter(Boolean);
    return names.length ? names : ['llama3.2'];
  } catch { return ['llama3.2']; }
}

// Model capability cache (from /api/tags) — used to know which models support
// the "think" parameter. Refreshed every 5 minutes.
let _capsCache = { at: 0, caps: {} };
async function getModelCaps(ollamaUrl) {
  if (Date.now() - _capsCache.at < 300000) return _capsCache.caps;
  try {
    const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const caps = {};
      for (const m of j.models || []) caps[m.name] = m.capabilities || [];
      _capsCache = { at: Date.now(), caps };
    }
  } catch { /* keep stale cache */ }
  return _capsCache.caps;
}

// ── Multi-model task routing ─────────────────────────────────────────────────
// Each task type routes to the best model actually present on the server
// (live /api/tags inventory), degrading gracefully through fallbacks:
//   1. exact preferred model, in order
//   2. any variant of a preferred family (e.g. qwen2.5-coder:1.5b for :7b)
//   3. any qwen2.5-coder or llama3.2 variant on the server
//   4. the user-configured models from Settings

const TASK_ROUTES = {
  quick_brief: { preferred: ['qwen2.5-coder:7b', 'llama3.2:latest'],                       numPredict: 1024, numCtx: 8192,  firstTokenMs: 60000 },
  portfolio:   { preferred: ['qwen2.5-coder:7b', 'llama3.2:latest'],                       numPredict: 4096, numCtx: 16384, firstTokenMs: 90000 },
  analysis:    { preferred: ['qwen3.6:latest', 'rafw007/qwen36-a3b-claude-coder:latest'],  numPredict: 2000, numCtx: 8192,  firstTokenMs: 90000,
                 speedFallback: true }  // degrade to the fast coder model if the 36B stalls/fails
};
// Legacy aliases so older callers keep working
TASK_ROUTES.fast  = TASK_ROUTES.quick_brief;
TASK_ROUTES.smart = TASK_ROUTES.analysis;

export function pickModelForTask(taskType, available, settings = {}) {
  const route = TASK_ROUTES[taskType] || TASK_ROUTES.analysis;

  for (const pref of route.preferred) {
    if (available.includes(pref)) return pref;
  }
  for (const pref of route.preferred) {
    const family = pref.split(':')[0];
    const variant = available.find(m => m === family || m.startsWith(family + ':'));
    if (variant) return variant;
  }
  const degraded = available.find(m => m.startsWith('qwen2.5-coder'))
                || available.find(m => m.startsWith('llama3.2'));
  if (degraded) return degraded;

  if (taskType === 'analysis' || taskType === 'smart') return settings.ollamaModel || 'llama3.2:latest';
  return settings.ollamaModelFast || settings.ollamaModel || 'llama3.2:latest';
}

// Parse one streamed line. Primary format is Ollama native NDJSON
// ({"message":{"content":"…"},"done":false} per line); also tolerates the
// OpenAI SSE layout ("data: {...}" with choices[0].delta.content) so the
// code survives an endpoint switch.
export function parseStreamLine(rawLine, onJson) {
  let line = (rawLine || '').trim();
  if (!line) return '';
  if (line.startsWith('data:')) line = line.slice(5).trim();
  if (!line || line === '[DONE]') return '';
  try {
    const j = JSON.parse(line);
    if (onJson) onJson(j);
    return j.message?.content ?? j.choices?.[0]?.delta?.content ?? '';
  } catch {
    return ''; // partial/garbled line — the buffer logic retries on next read
  }
}

// Hard ceiling for context allocation — matches what the shared GPU server can
// hold for the 36B model without paging.
const MAX_CTX = 16384;

// ~3.2 chars/token is conservative for English + markdown + JSON mixes.
const estTokens = (s) => Math.ceil((s || '').length / 3.2);

// One streaming request to a specific model, with retry + stall watchdog.
async function streamOllamaChat({ ollamaUrl, model, messages, route, caps, onChunk }) {
  // Size num_ctx from the actual prompt. If the prompt would fill the window,
  // Ollama silently truncates it to num_ctx and generation gets ZERO room —
  // the stream "succeeds" with done_reason:length and an empty response.
  let msgs = messages.map(m => ({ role: m.role, content: m.content }));
  const reserve = route.numPredict + 512; // generation room + template overhead
  const maxPromptTokens = MAX_CTX - reserve;
  let promptTokens = msgs.reduce((n, m) => n + estTokens(m.content), 0);

  if (promptTokens > maxPromptTokens) {
    // Trim the longest message (the user prompt with all the history blocks)
    // from the tail — the prompt builders put instructions before data, and
    // the most recent chatter is listed first within each block.
    const longest = msgs.reduce((a, b) => estTokens(a.content) > estTokens(b.content) ? a : b);
    const excessChars = Math.ceil((promptTokens - maxPromptTokens) * 3.2) + 200;
    longest.content = longest.content.slice(0, Math.max(1000, longest.content.length - excessChars))
      + '\n\n[…older history trimmed to fit the model context window]';
    promptTokens = msgs.reduce((n, m) => n + estTokens(m.content), 0);
  }

  const numCtx = Math.min(MAX_CTX, Math.max(route.numCtx, promptTokens + reserve));

  const body = {
    model,
    stream: true,
    messages: msgs,
    options: {
      temperature: 0.3,
      num_predict: route.numPredict,
      num_ctx: numCtx
    }
  };
  // Disable thinking for all known reasoning-capable models.
  // Caps detection requires Ollama ≥ v0.7 — name-based fallback covers older builds.
  const isThinkingModel = (caps[model] || []).includes('thinking')
    || /qwen3|qwq|deepseek-r[01]/i.test(model);
  if (isThinkingModel) body.think = false;

  // Retry up to 3 times on transient errors with exponential backoff
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 4000)); // 4s, 8s

    // Watchdog: abort if the first token (model load) or any subsequent token
    // takes too long — this is what frees us to fall back to a faster model
    const controller = new AbortController();
    let watchdog = setTimeout(() => controller.abort(), route.firstTokenMs || 90000);
    const armInterChunk = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 60000); };

    let res;
    try {
      res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(watchdog);
      if (controller.signal.aborted) throw new Error(`"${model}" did not respond within ${Math.round((route.firstTokenMs || 90000) / 1000)}s`);
      throw err;
    }

    if (!res.ok) {
      clearTimeout(watchdog);
      const errText = await res.text().catch(() => '');
      // Some thinking models (e.g. deepseek-r1) can't disable thinking — drop the flag and retry
      if (body.think === false && /think/i.test(errText)) {
        delete body.think;
        lastErr = new Error('Model rejected think:false — retrying without it');
        continue;
      }
      if (res.status === 429 && attempt < 2) {
        lastErr = new Error(`Ollama busy (429) — retrying…`);
        continue;
      }
      throw new Error(`Ollama ${res.status}: ${errText.slice(0, 300)}`);
    }

    // True realtime streaming: read chunk-by-chunk, emit deltas live
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', fullText = '', sawThinking = false, ndjsonDone = false;
      const trackMeta = (j) => {
        if (j.message?.thinking) sawThinking = true;
        if (j.done === true) ndjsonDone = true;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        armInterChunk();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep the trailing partial line for the next read
        for (const raw of lines) {
          const delta = parseStreamLine(raw, trackMeta);
          if (delta) { fullText += delta; onChunk(delta, fullText); }
        }
        // Ollama signals end via {"done":true} in NDJSON — don't wait for TCP close
        if (ndjsonDone) { reader.cancel().catch(() => {}); break; }
      }
      clearTimeout(watchdog);

      // Flush whatever remained in the buffer after the final read
      const tailDelta = parseStreamLine(buffer, trackMeta);
      if (tailDelta) { fullText += tailDelta; onChunk(tailDelta, fullText); }

      if (fullText.trim().length < 20) {
        // A truncated-prompt overflow "succeeds" with a handful of chars —
        // treat it like a failure so the retry / speed-fallback path engages
        throw new Error(sawThinking
          ? `"${model}" spent its whole token budget thinking and never answered`
          : `"${model}" returned an empty response. Verify the model name in Settings.`);
      }
      return fullText;
    } catch (err) {
      clearTimeout(watchdog);
      if (controller.signal.aborted) throw new Error(`"${model}" stalled mid-generation (no output for 60s)`);
      throw err;
    }
  }

  throw lastErr || new Error('Ollama failed after 3 attempts. Check the server URL in Settings.');
}

// taskType: 'quick_brief' | 'portfolio' | 'analysis' (aliases: 'fast', 'smart')
//
// Uses Ollama's NATIVE /api/chat (not the OpenAI-compat endpoint) because:
// 1. think:false — thinking models (qwen3.x) otherwise burn the entire token
//    budget on hidden reasoning and return EMPTY content for big prompts
// 2. num_ctx — the OpenAI endpoint can't set context size, so the server
//    default (often 4k) silently truncates our action-plan prompt
//
// Streams deltas to onChunk(delta, accumulated) in realtime. If the heavyweight
// analysis model fails or stalls, gracefully degrades to the fast coder model
// so the user is never left hanging on slow internal hardware.
export async function ollamaChat(messages, taskType, onChunk) {
  const settings = await getLlmSettings();
  const { ollamaUrl } = settings;
  const route = TASK_ROUTES[taskType] || TASK_ROUTES.analysis;
  const caps = await getModelCaps(ollamaUrl);
  const available = Object.keys(caps);
  const model = pickModelForTask(taskType, available, settings);

  try {
    return await streamOllamaChat({ ollamaUrl, model, messages, route, caps, onChunk });
  } catch (err) {
    if (route.speedFallback) {
      // Route the same request through the fast-tier preference chain
      // (qwen2.5-coder:7b first) — keeps the extension responsive when the
      // 36B model is overloaded, cold, or missing
      const fallbackModel = pickModelForTask('quick_brief', available, settings);
      if (fallbackModel && fallbackModel !== model) {
        return await streamOllamaChat({ ollamaUrl, model: fallbackModel, messages, route, caps, onChunk });
      }
    }
    throw err;
  }
}

// ── JSON extraction ───────────────────────────────────────────────────────────

// Robustly pull a JSON object out of an LLM response. Thinking models (qwen3.x,
// deepseek-r1, glm) may wrap the answer in <think> blocks, draft JSON mid-
// reasoning, or add prose around it — a greedy first-{ to last-} regex breaks
// on all of those. This strips reasoning, then scans for brace-balanced
// candidates (string-aware) and prefers the LAST one with the required keys,
// since the final answer comes after any drafts.
export function extractJsonObject(text, requiredKeys = []) {
  if (!text) return null;
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If there's a fenced code block containing an object, prefer its content
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]?.includes('{')) t = fence[1].trim();

  const candidates = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const c = t[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { candidates.push(t.slice(i, j + 1)); i = j; break; }
      }
    }
  }

  let bestMatch = null, firstParsed = null;
  for (const cand of candidates) {
    try {
      const obj = JSON.parse(cand);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
      if (!firstParsed) firstParsed = obj;
      if (!requiredKeys.length || requiredKeys.every(k => k in obj)) bestMatch = obj;
    } catch { /* not valid JSON — keep scanning */ }
  }
  return bestMatch || firstParsed;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export const QUICK_BRIEF_SYSTEM_PROMPT = `You are a CSM analyst at Odoo. Given a customer's Notes tab content + recent chatter, produce a strict JSON brief with these exact 5 fields:

{
  "companyOverview": "1–2 sentence summary of what the company does. If unclear from data, say 'Not enough info'.",
  "painPoints": "Active pain points or legacy systems they've mentioned. If none in data, say 'None mentioned'.",
  "industry": "One short label — e.g. 'Trading', 'Manufacturing', 'Healthcare', 'Construction', 'IT Services'. If unclear, 'Unknown'.",
  "project": "Active project with us, if any. Mention name + hours remaining if visible. If no project, say 'No active project'.",
  "contact": "Primary contact name + role/title. If only a name found with no role, just the name. If none in data, 'Unknown'."
}

STRICT RULES:
- Respond ONLY with valid JSON — no markdown, no explanation.
- Every field MUST be a string. No nested objects, no arrays.
- Never invent — if a field isn't in the data, use 'Not enough info' / 'None mentioned' / 'Unknown' / 'No active project'.
- Keep each field under 200 characters.`;

export function buildQuickBriefPrompt(odooData, projectInfo) {
  const notes = (odooData.notesContent || '').slice(0, 1500);
  const recentChatter = (odooData.chatHistory || [])
    .filter(m => !isAutomatedNotification(m))   // strip Odoobot payment/invoice spam
    .filter(m => (m.body || '').length > 20)
    .slice(0, 15)
    .map(m => `[${(m.date || '').slice(0, 10)}] ${m.author}: ${(m.body || '').slice(0, 200).replace(/\n/g, ' ')}`)
    .join('\n');

  const projectBlock = projectInfo?.activeProjects?.length
    ? projectInfo.activeProjects.map(p => `- ${p.name} (${p.hoursRemaining ?? '?'}h remaining, ${p.hoursLogged ?? '?'}h logged)`).join('\n')
    : 'No project data available';

  return `Customer: ${odooData.customerName || 'Unknown'}
Subscription Plan: ${odooData.subscriptionPlan || 'unknown'}
Recurring Amount: ${odooData.recurringAmount || 'unknown'}

## Notes Tab Content
${notes || '(empty)'}

## Recent Chatter (newest first)
${recentChatter || '(no chatter)'}

## Active Projects With Us (from Project module)
${projectBlock}

Produce the JSON brief now.`;
}

export const RESEARCH_SYSTEM_PROMPT = `You are a B2B intelligence analyst.
Given company website content about a company, produce a structured company profile in JSON.
Focus on: industry vertical, company size, funding/investment signals, recent activity, expansion signals (new hires, new markets, new departments, new products), risk signals (layoffs, leadership changes, cost-cutting, ERP evaluation), competitor mentions (SAP, Oracle, Microsoft Dynamics, Zoho, ERPNext).
Respond ONLY with valid JSON — no markdown, no explanation.`;

export const ACTION_PLAN_SYSTEM_PROMPT = `You are a senior Customer Success Manager at Odoo. You follow the internal CSM Health Categorization playbook and have deep knowledge of the Odoo platform.

STRICT RULE #1 — NO INVENTION: Every talking point in every activity MUST reference a specific data point from the account data below — a date, a number, a name, or a direct quote from chatter. If there is not enough real data to support a talking point, omit it. Never invent facts, names, or statistics.

STRICT RULE #2 — TIMELINE AWARENESS: Chatter is a chronological log. Read it as a timeline (newest messages first, then work backwards). If an issue was raised on date X and a later message confirms it was resolved/fixed/closed/handled, treat it as RESOLVED — do not include it in active issues. Only treat an issue as OPEN if there is no later message confirming resolution. When in doubt, check if the most recent chatter mentions the same topic positively (resolved) or negatively (still pending).

## ODOO PLATFORM KNOWLEDGE (use when crafting activities)

SUBSCRIPTION LIFECYCLE:
- In Progress = active subscription. Renewal = customer continues (auto or via Renew button on SO). Churned = closed.
- Renew: clicking "Renew" generates a Renewal Quotation that must be confirmed, invoiced, and paid.
- Upsell: click "Upsell" on SO → new quotation, products prorated for remaining period. SO must be invoiced first.
- Close: admin clicks "Close" → reason + date → status becomes Churned. Customer can self-close via portal if Closable enabled.
- Recurring Plans: Monthly / Yearly / 2Y / 3Y / 5Y. Longer plans = discounted rates + better retention.

## MODULE EXPANSION FRAMEWORK (CRITICAL — use the right module for the right industry)

CORE MODULES (must-haves — most businesses need these):
- Accounting — every company has books
- CRM — pipeline, leads, opportunities
- Sales — quotations, orders, invoicing
- Inventory — stock tracking (for goods-based businesses)
- Purchase — vendor management, POs
- Manufacturing — for any production/assembly business
- HR (Employees + Payroll + Time Off) — companies with 10+ employees

NICE-TO-HAVE MODULES (situational — don't push unless clearly justified):
- Marketing Automation, Email Marketing, SMS Marketing, Social Marketing
- eCommerce, Website builder
- Helpdesk (only if customer has support team)
- Project (only if PM-heavy business)
- Documents, Sign, Knowledge

INDUSTRY → CORE MODULE MAPPING (suggest gaps when customer is missing these):
- Trading / Distribution / Wholesale → Accounting + Sales + Inventory + Purchase + CRM (+ HR if 10+ employees)
- Manufacturing / Production → Accounting + Sales + Inventory + Purchase + Manufacturing + HR
- Retail / Shop → Accounting + Sales + Inventory + POS + Purchase (+ eCommerce if online)
- Services / Consulting → Accounting + Sales + CRM + Project + Timesheets + HR
- Construction / Contracting → Accounting + Sales + Inventory + Purchase + Project + HR
- Restaurant / F&B → Accounting + Sales + Inventory + POS + Purchase
- Logistics / Transport → Accounting + Sales + Inventory + Fleet + HR
- Healthcare / Clinics → Accounting + Sales + CRM + Appointments + HR
- Real Estate → Accounting + CRM + Sales + Property mgmt + Documents
- IT / Software / Agency → Accounting + Sales + CRM + Project + Timesheets + Helpdesk

UPSELL ANALYSIS RULE:
- Identify customer's industry from chatter / company name / notes
- Look at "Installed Odoo Modules" section — which CORE modules are MISSING for their industry?
- Recommend the missing CORE module first (e.g. "Trading company using only Accounting → propose Sales + Inventory + Purchase")
- Only suggest nice-to-haves if the customer has explicitly mentioned a related pain (e.g. they said "we email customers manually" → propose Email Marketing)
- Never push more than 2 expansion modules in one plan — keep it focused

UPSELL TRIGGERS TO WATCH FOR IN CHATTER:
- Customer mentions needing more users → push user license expansion
- Customer mentions a department/process not yet in Odoo → suggest the matching CORE module
- Utilization >80% of licensed users → propose additional seats before they hit cap
- Multi-year renewal coming up → convert Monthly/Yearly to 2Y or 3Y for discount + retention

ISSUE→PROBE PLAYBOOK (map account signals to specific conversations — these override generic activities):
- Repeated invoice/payment reminders in history → probe their finance process pain; propose Accounting follow-up automation
- Success Pack hours nearly exhausted (see project data) → schedule the pack-renewal conversation BEFORE hours run out
- Blocked or stale implementation tasks → resolve/escalate first; NEVER upsell into an unresolved implementation
- Departed key contact (champion left the company) → top priority: identify and build relationship with the replacement
- 3+ different salespeople have managed the account → open by acknowledging the handovers and demonstrating you know their full history (they should not have to repeat themselves)
- Lost or stalled CRM opportunities → revisit the original presales pain points; circumstances may have changed
- Pattern of overdue/late invoices → flag renewal risk; address the satisfaction root cause before any invoicing conversation
- On-Premise hosting or an outdated version → version upgrade / migration to Odoo Online or Odoo.sh conversation
- Customer was previously with a reseller/partner → probe for onboarding gaps the partner left; position direct support value

RENEWAL BEST PRACTICES:
- Renewal quotation from SO via "Renew" → confirm → invoice → register payment
- Initiate 30–60 days before expiry
- If unpaid → database may auto-close (Automatic Closing days set per plan)
- At-risk accounts: offer to restructure plan (Monthly → Yearly = better deal + better retention)

## HEALTH TIER PLAYBOOKS

HEALTHY (≥70% utilization, responsive, meeting within 30d):
→ Monthly strategic check-in. Explore referrals, upsells, or QBR scheduling. Keep it light and value-focused.

MODERATE (50–70% utilization, no reply 10+ days, or meeting 30–45d ago):
→ Check-in every 2–3 weeks. Dig into friction. Push adoption of underused modules. Re-engage a specific user group.

AT RISK (<50% utilization, unresponsive 14+ days, escalation/complaints, or renewal <30d):
→ Weekly follow-up. Involve PM or Support if open ticket. Prepare recovery plan. Every activity needs urgency.

## PRIORITY ORDER FOR ACTIVITIES
0. Open issues — unresolved support ticket, unanswered customer question, pending CSM commitment, complaint → dedicated activity
1. Renewal risk — if renewal <60 days, at least one activity must address retention directly
2. Usage health — low utilization = adoption risk; reference actual user counts
3. QBR / Monthly Review — if last meeting >45 days ago, suggest scheduling one
4. Module expansion — only if genuinely relevant to this company's industry
5. Relationship check-in — fallback only

DATA SOURCES: "Internal CSM Notes" = private notes. "[LOG NOTE]" = internal logs. "[prev-sub]" = previous subscription notes. Use ALL.

COMPETITOR RISK: Flag immediately in Risk Flags if any ERP competitor mentioned (SAP, Oracle, Microsoft Dynamics, Zoho, ERPNext).

TONE: Warm, consultative, and respectful — not transactional or pushy. Match the customer's communication language (English or Arabic) based on their chatter.

## OUTPUT FORMAT (follow exactly)

## Situation Assessment
[3-5 bullets with actual data: MRR, renewal date + days, health tier, utilization %, last contact date, open issues if any]

## Health Classification
[State HEALTHY / MODERATE / AT RISK and the 1–2 data points that determined it]

## Risk Flags
[Specific risks with evidence, or "None identified"]

## Expansion Opportunities
[Only modules genuinely fitting this company's industry. Reference actual company data. "None identified at this time" if not clearly justified.]

## Recommended Activities

### Activity 1: [Phone Call|Email|Meeting] — [summary ≤60 chars]
Due: YYYY-MM-DD
Notes:
- Trigger: [specific signal — e.g. "no reply in 18 days", "renewal in 12 days", "customer asked about payroll on 2026-04-12"]
- Ask: [one specific question or action for this interaction]
- Reference: [exact quote, date, or number from the data to open the conversation with]

### Activity 2: [Phone Call|Email|Meeting] — [summary ≤60 chars]
Due: YYYY-MM-DD
Notes:
- Trigger: [specific signal]
- Ask: [specific question or action]
- Reference: [exact data point]

### Activity 3: [Phone Call|Email|Meeting] — [summary ≤60 chars]
Due: YYYY-MM-DD
Notes:
- Trigger: [specific signal]
- Ask: [specific question or action]
- Reference: [exact data point]`;

export function buildResearchPrompt(companyName, websiteText) {
  return `Company name: ${companyName}

## Company Website
${websiteText || 'Not available'}

Also flag any signals of:
- ERP evaluation or competitor mentions (SAP, Oracle, Microsoft Dynamics, Zoho, ERPNext)
- Cost cutting or budget pressure
- Leadership/IT decision-maker changes

Respond ONLY with valid JSON using this exact schema:
{
  "industry": "...",
  "size": "...",
  "recentInvestments": ["..."],
  "expansionSignals": ["..."],
  "riskSignals": ["..."],
  "newDepartments": ["..."],
  "recentPosts": ["..."],
  "competitorRisk": "...",
  "summary": "2-3 sentence executive summary"
}`;
}

function skipWeekend(date) {
  const day = date.getDay(); // 0=Sun, 6=Sat
  if (day === 6) date.setDate(date.getDate() + 2);
  else if (day === 0) date.setDate(date.getDate() + 1);
  return date;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return skipWeekend(d).toISOString().split('T')[0];
}

function buildDeepIntelBlock(deepIntel, currency = '') {
  if (!deepIntel) return '';
  const lines = ['\n## Deep Intel (Sales History, Tasks, Timesheets)'];

  // Sales orders
  if (deepIntel.salesOrders?.length) {
    lines.push('\n### Past Sales Orders');
    for (const o of deepIntel.salesOrders) {
      const amt = o.amount_total != null ? ` — ${o.amount_total.toLocaleString()} ${currency}`.trimEnd() : '';
      const date = o.date_order ? ` (${o.date_order.slice(0, 10)})` : '';
      lines.push(`- ${o.name}${date}${amt} [${o.state}]`);
    }
  } else {
    lines.push('\n### Past Sales Orders: none found');
  }

  // Tasks
  if (deepIntel.tasks?.length) {
    lines.push('\n### Tasks');
    for (const t of deepIntel.tasks) {
      const stage = t.stage_id?.[1] || 'Unknown';
      const deadline = t.date_deadline ? ` — due ${t.date_deadline}` : '';
      const state = t.kanban_state === 'blocked' ? ' ⚠ BLOCKED' : t.kanban_state === 'done' ? ' ✓' : '';
      lines.push(`- [${stage}]${state} ${t.name}${deadline}`);
    }
  } else {
    lines.push('\n### Tasks: none found');
  }

  // Timesheets
  const ts = deepIntel.timesheets;
  if (ts) {
    lines.push('\n### Timesheets');
    lines.push(`- Total hours logged: ${ts.totalHours}h`);
    lines.push(`- Last 30 days: ${ts.last30Hours}h`);
    if (ts.topContributors?.length) lines.push(`- Top contributors: ${ts.topContributors.join(', ')}`);
    if (ts.recentEntries?.length) {
      lines.push('- Recent entries:');
      for (const e of ts.recentEntries) {
        lines.push(`  • ${e.date} | ${e.employee}: ${e.hours}h — ${e.description || '(no description)'}`);
      }
    }
  }

  return lines.join('\n');
}

// Partner-level "Customer 360" — opportunities, invoices, contacts, order history
// fetched via RPC from the customer's contact record (covers the whole company,
// regardless of reseller past or broken renewal chains).
function buildPartnerIntelBlock(researchData, currency = '') {
  const pi = researchData?.partnerIntel;
  const prevOrders = researchData?.previousOrders || [];
  if (!pi && !prevOrders.length) return '';

  const lines = ['\n## Customer 360 (partner-level data)'];

  if (prevOrders.length) {
    lines.push('\n### All Orders for This Customer (any salesperson, incl. reseller era)');
    for (const o of prevOrders.slice(0, 10)) {
      const amt = o.amount_total != null ? ` — ${o.amount_total.toLocaleString()} ${currency}`.trimEnd() : '';
      const date = o.date_order ? ` (${o.date_order.slice(0, 10)})` : '';
      const subState = o.subscription_state ? ` [sub: ${String(o.subscription_state).replace(/^\d+_/, '')}]` : '';
      const sp = o.user_id?.[1] ? ` — sp: ${o.user_id[1]}` : '';
      lines.push(`- ${o.name}${date}${amt} [${o.state}]${subState}${sp}`);
    }
  }

  if (pi?.opportunities?.length) {
    lines.push('\n### Presales / CRM Opportunities (what they were sold on)');
    for (const l of pi.opportunities) {
      const stage = l.stage_id?.[1] || (l.active === false ? 'Lost/Archived' : 'Unknown stage');
      const rev = l.expected_revenue ? ` — ${l.expected_revenue.toLocaleString()} ${currency}`.trimEnd() : '';
      const created = l.create_date ? ` (${l.create_date.slice(0, 10)})` : '';
      lines.push(`- [${stage}] ${l.name}${rev}${created}`);
    }
  }

  if (pi?.invoices) {
    const inv = pi.invoices;
    lines.push('\n### Invoices & Payment Behavior');
    lines.push(`- Posted invoices: ${inv.count}, overdue/unpaid past due: ${inv.overdueCount}`);
    if (inv.recent?.length) {
      for (const i of inv.recent) {
        lines.push(`- ${i.name} (${i.invoice_date || '?'}) ${i.amount_total?.toLocaleString?.() || i.amount_total} ${currency} — ${i.payment_state}`.trimEnd());
      }
    }
  }

  if (pi?.contacts) {
    lines.push('\n### Contacts at Customer');
    lines.push(`- Total contacts on record: ${pi.contacts.total}`);
    if (pi.contacts.departed?.length) {
      lines.push(`- ⚠ DEPARTED contacts (champion-left risk): ${pi.contacts.departed.join('; ')}`);
    }
    if (pi.contacts.list?.length) {
      for (const c of pi.contacts.list.slice(0, 6)) {
        lines.push(`- ${c.name}${c.function ? ` — ${c.function}` : ''}${c.email ? ` <${c.email}>` : ''}`);
      }
    }
  }

  return lines.join('\n');
}

function buildKeySignals(odooData, researchData) {
  // Last contact — find most recent chatter message with meaningful content
  const allMsgs = [...(odooData.chatHistory || []), ...(odooData.salesHistory || [])];
  const lastMsg = allMsgs.filter(m => (m.body || '').length > 10)[0];
  let daysSinceContact = null;
  if (lastMsg?.date) {
    const parsed = new Date(lastMsg.date);
    if (!isNaN(parsed)) daysSinceContact = Math.round((Date.now() - parsed) / 86400000);
  }
  const lastContactStr = daysSinceContact != null
    ? `${daysSinceContact} days ago — "${(lastMsg.body || '').slice(0, 80).replace(/\n/g, ' ')}"`
    : 'No contact history found';

  // Renewal urgency tier
  const r = odooData.daysUntilRenewal;
  const renewalTier = r == null ? 'Unknown'
    : r <= 14 ? `CRITICAL (${r} days)`
    : r <= 30 ? `HIGH (${r} days)`
    : r <= 60 ? `MEDIUM (${r} days)`
    : `LOW (${r} days)`;

  // Utilization health
  const u = odooData.dbInfo?.utilization;
  const uStr = u != null
    ? `${u}% — ${u < 50 ? 'At-Risk' : u < 70 ? 'Moderate' : 'Healthy'} (${odooData.dbInfo.regularUsers} licensed)`
    : 'Not available';

  // Open tasks (from deep intel)
  const tasks = researchData?.deepIntel?.tasks || [];
  const blocked = tasks.filter(t => t.kanban_state === 'blocked').length;
  const taskStr = tasks.length ? `${tasks.length} tasks${blocked ? `, ${blocked} BLOCKED` : ''}` : 'None found';

  // Scan chatter for issues + check if later messages indicate resolution
  // allMsgs is newest-first. For each issue, check if a NEWER msg about same topic says "resolved"
  const issueKeywords = /support|ticket|issue|problem|error|bug|pending|follow.?up|waiting|unresolved|complaint|escalat/i;
  const resolvedKeywords = /resolved|fixed|closed|done|completed|sorted|handled|solved|working now|all good|no longer|update.*deployed|patch.*applied/i;

  // Helper: extract a short "topic" from a message body for matching
  const topicWords = (body) => (body || '').toLowerCase().match(/\b\w{5,}\b/g)?.slice(0, 10) || [];

  const issueMessages = allMsgs.filter(m => issueKeywords.test(m.body || ''));
  const classifiedIssues = issueMessages.slice(0, 5).map(issueMsg => {
    const issueDate = new Date(issueMsg.date);
    const issueTopic = topicWords(issueMsg.body);

    // Look at messages NEWER than this issue — if any mention resolution AND share topic words, mark resolved
    const newerMsgs = allMsgs.filter(m => {
      const d = new Date(m.date);
      return !isNaN(d) && d > issueDate;
    });

    const resolvedByMsg = newerMsgs.find(m => {
      if (!resolvedKeywords.test(m.body || '')) return false;
      const mTopic = topicWords(m.body);
      // shares at least 2 meaningful words with the issue → likely same topic
      const overlap = issueTopic.filter(w => mTopic.includes(w)).length;
      return overlap >= 2;
    });

    const status = resolvedByMsg ? `RESOLVED (${resolvedByMsg.date?.slice(0, 10)})` : 'STILL OPEN';
    const snippet = (issueMsg.body || '').slice(0, 100).replace(/\n/g, ' ');
    return `  * [${status}] "${snippet}" (${(issueMsg.date || '').slice(0, 10)})`;
  });

  const openIssues = classifiedIssues.filter(i => i.includes('STILL OPEN'));
  const resolvedIssues = classifiedIssues.filter(i => i.includes('RESOLVED'));
  const issuesBlock = classifiedIssues.length === 0
    ? 'None detected'
    : '\n' + classifiedIssues.join('\n');

  // Deep intel summary
  const di = researchData?.deepIntel;
  const diStr = di
    ? `${di.salesOrders?.length || 0} past orders, ${di.tasks?.length || 0} tasks, ${di.timesheets?.totalHours || 0}h logged`
    : 'Not collected (Deep Search off)';

  // Partner-level signals (Customer 360)
  const pi = researchData?.partnerIntel;
  const prevOrders = researchData?.previousOrders || [];
  const distinctSalespeople = [...new Set(prevOrders.map(o => o.user_id?.[1]).filter(Boolean))];
  const handoverStr = distinctSalespeople.length >= 3
    ? `⚠ ${distinctSalespeople.length} different salespeople have managed this account — acknowledge handovers, do not make them repeat their history`
    : distinctSalespeople.length
      ? `${distinctSalespeople.length} salesperson(s) historically`
      : 'unknown';
  const championStr = pi?.contacts?.departed?.length
    ? `⚠ CHAMPION LEFT: ${pi.contacts.departed.join('; ')} — rebuilding the relationship with their replacement is a top-priority activity`
    : pi?.contacts ? 'No departed contacts detected' : 'unknown';
  const paymentStr = pi?.invoices
    ? (pi.invoices.overdueCount > 0
        ? `⚠ ${pi.invoices.overdueCount} of ${pi.invoices.count} invoices overdue/unpaid — churn signal, address satisfaction before invoicing talk`
        : `${pi.invoices.count} invoices, none overdue — healthy payer`)
    : 'unknown';
  const presalesStr = pi?.opportunities?.length
    ? `${pi.opportunities.length} CRM opportunities on record (see Customer 360 for original pain points)`
    : 'none found';

  // Classify health tier using the internal CSM guide criteria
  let healthTier = 'UNKNOWN';
  if (u != null && daysSinceContact != null) {
    const escalation = openIssues.length > 0;  // STILL OPEN issues only — resolved ones don't count
    if (u < 50 || daysSinceContact > 14 || escalation) {
      healthTier = 'AT RISK — Weekly follow-up required. Involve PM/Support if needed. Prepare recovery plan.';
    } else if (u < 70 || daysSinceContact > 10) {
      healthTier = 'MODERATE — Check-in every 2–3 weeks. Find friction points and push for adoption.';
    } else {
      healthTier = 'HEALTHY — Monthly strategic check-in. Good time to explore referrals or upsell.';
    }
  } else if (u != null) {
    healthTier = u < 50 ? 'AT RISK (utilization only)' : u < 70 ? 'MODERATE (utilization only)' : 'HEALTHY (utilization only)';
  }

  return `## Key Account Signals (pre-computed — use these directly)
- Health Tier: ${healthTier}
- Last contact: ${lastContactStr}
- Days since last contact: ${daysSinceContact != null ? daysSinceContact : 'unknown'}
- Renewal urgency: ${renewalTier}
- Utilization: ${uStr}
- Open tasks: ${taskStr}
- Chatter issues scan (with resolution status — DO NOT include RESOLVED issues in your action plan):${issuesBlock === 'None detected' ? ' ' + issuesBlock : issuesBlock}
- Active (still-open) issues count: ${openIssues.length}
- Resolved issues count (already handled — do not raise these again): ${resolvedIssues.length}
- Key contacts: ${championStr}
- Account continuity: ${handoverStr}
- Payment behavior: ${paymentStr}
- Presales history: ${presalesStr}
- Deep intel: ${diStr}`;
}

// Filter out payment/invoice/billing automated notifications — system noise that
// is NOT CSM-relevant. The CSM cares about customer behavior, not payment plumbing.
// Exported for the regression test harness.
export function isAutomatedNotification(msg) {
  const b = (msg.body || '').toLowerCase();
  const a = (msg.author || '').toLowerCase();
  const isBot = a === 'odoobot' || a === 'odoo bot' || a === 'system' || a === 'mailer-daemon';

  // Payment / billing / invoice automation patterns (apply regardless of author —
  // even human-sent payment reminders are noise for CSM analysis)
  const paymentNoise = new RegExp([
    'payment.{0,40}(reference|confirmed|received|processed|posted|registered)',
    'thank you for your trust',
    'invoice.{0,40}(sent|paid|generated|created|attached|due)',
    'email sent to customer',
    'payment.{0,40}(refused|failed|declined|rejected)',
    'payment was refused',
    'insufficient.{0,20}(funds|balance)',
    'transaction.{0,40}(posted|completed|approved|declined|failed)',
    'next invoice.{0,30}set to',
    'card.{0,20}(declined|expired|failed)',
    'credit.card.{0,20}(declined|expired)',
    'auto[-\\s]?renewal.{0,30}(failed|succeeded|processed)',
    'subscription.{0,40}(invoiced|billed|charged)',
    'your order.{0,30}(has been|is ready|confirmed)',
    'amounting.{0,30}for your order',
    'a payment with reference',
    'reminder.{0,40}(invoice|payment|overdue)',
    'overdue.{0,30}(invoice|payment|amount)',
    'kindly use this payment link',
    'access[-_]?token=',
    'mailer.?daemon|delivery (failed|status|notification)',
    'do not reply',
    'noreply@'
  ].join('|'), 'i');

  if (isBot && /payment|invoice|transaction|reference/i.test(b)) return true;
  if (paymentNoise.test(b)) return true;
  return false;
}

export function buildActionPlanPrompt(odooData, companyProfile, researchData) {
  const products = odooData.products?.length
    ? odooData.products.map(p => `  - ${p.name} × ${p.qty} @ ${p.unitPrice}`).join('\n')
    : '  - (no products listed)';

  // Strip automated payment/invoice notifications before sending to AI.
  // Bodies are capped to keep the full prompt inside the model's context window —
  // a truncated playbook is worse than shorter chatter excerpts.
  const cleanChat = (odooData.chatHistory || []).filter(m => !isAutomatedNotification(m));
  const chatter = cleanChat.length
    ? cleanChat.slice(0, 20).map(m => {
        const tag = m.type === 'log_note' ? '[LOG NOTE]' : '[MSG]';
        return `${tag} ${m.date} | ${m.author}: ${(m.body || '').slice(0, 400)}`;
      }).join('\n')
    : '(no communication history)';

  const cleanSales = (odooData.salesHistory || []).filter(m => !isAutomatedNotification(m));
  const salesHistory = cleanSales.length
    ? cleanSales.slice(0, 12).map(m => {
        const src = m.sourceOrder ? `[${m.sourceOrder}]` : '[prev]';
        const tag = m.type === 'log_note' ? '[LOG NOTE]' : '[MSG]';
        return `${src} ${tag} ${m.date} | ${m.author}: ${(m.body || '').slice(0, 280)}`;
      }).join('\n')
    : '(none found)';

  const today = new Date().toISOString().split('T')[0];

  // Cadence: factor in both renewal urgency AND days since last contact
  const r = odooData.daysUntilRenewal;
  const allMsgsForCadence = [...(odooData.chatHistory || []), ...(odooData.salesHistory || [])];
  const lastMsgForCadence = allMsgsForCadence.filter(m => (m.body || '').length > 10)[0];
  let daysSinceContact = null;
  if (lastMsgForCadence?.date) {
    const parsed = new Date(lastMsgForCadence.date);
    if (!isNaN(parsed)) daysSinceContact = Math.round((Date.now() - parsed) / 86400000);
  }
  const isUrgent = (r != null && r <= 14) || (daysSinceContact != null && daysSinceContact > 30);
  const isHigh   = (r != null && r <= 30) || (daysSinceContact != null && daysSinceContact > 14);
  const act1 = isUrgent ? daysFromNow(1) : isHigh ? daysFromNow(2) : daysFromNow(3);
  const act2 = isUrgent ? daysFromNow(3) : isHigh ? daysFromNow(5) : daysFromNow(7);
  const act3 = isUrgent ? daysFromNow(7) : isHigh ? daysFromNow(10) : daysFromNow(14);

  const renewalBlock = odooData.renewalDate
    ? `\n## Renewal Information
- Renewal Date: ${odooData.renewalDate}
- Days Until Renewal: ${odooData.daysUntilRenewal ?? 'unknown'}
${odooData.daysUntilRenewal != null && odooData.daysUntilRenewal < 60
  ? '⚠️ RENEWAL WITHIN 60 DAYS'
  : ''}`
    : '';

  const utilizationBlock = odooData.dbInfo?.utilization != null
    ? `\n## Database Utilization
- Licensed Users: ${odooData.dbInfo.regularUsers}
- Recent Active Users (last 5 pings): ${odooData.dbInfo.activeUsersList?.join(', ')}
- Utilization Rate: ${odooData.dbInfo.utilization}%
${odooData.dbInfo.utilization < 60 ? '⚠️ LOW UTILIZATION — adoption risk' : ''}`
    : '';

  const adoptionBlock = odooData.installedModules?.length
    ? `\n## Installed Odoo Modules
${odooData.installedModules.join(', ')}
(Only suggest expansion modules NOT in this list AND relevant to this company's specific industry.)`
    : '';

  return `${buildKeySignals(odooData, researchData)}

## Customer: ${odooData.customerName}

## Subscription
- Order: ${odooData.soNumber}
- Plan: ${odooData.subscriptionPlan || 'N/A'}
- Recurring Amount: ${odooData.recurringAmount || 'N/A'} ${odooData.currency || ''}
- Products:
${products}
- Salesperson: ${odooData.assignedSalesperson || 'N/A'}
- Hosting: ${odooData.hosting || 'N/A'}
${renewalBlock}
${utilizationBlock}
${adoptionBlock}
## Internal CSM Notes (from Notes tab)
${odooData.notesContent || '(none)'}

## Odoo Communication History (current subscription)
${chatter}

## Previous Subscription History
${salesHistory}

## Company Intelligence (Web Research)
${JSON.stringify(companyProfile, null, 2)}
${buildPartnerIntelBlock(researchData, odooData.currency)}
${buildDeepIntelBlock(researchData?.deepIntel, odooData.currency)}

## Today's Date
${today}

## Suggested Due Dates (use these EXACT dates — weekdays only, already adjusted)
- Activity 1: ${act1}
- Activity 2: ${act2}
- Activity 3: ${act3}

Generate the CSM action plan now. Start from the Key Account Signals above — address open issues first, then follow the playbook for the Health Tier. Every activity note must cite a specific data point (date, quote, number) from the sections above. Due dates must be weekdays only.`;
}

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function parseDateFlexible(str) {
  if (!str) return null;
  const s = str.trim();

  // YYYY-MM-DD (ISO)
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // DD/MM/YYYY or MM/DD/YYYY
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    // Assume DD/MM/YYYY (more common outside US)
    const d1 = new Date(+m[3], +m[2] - 1, +m[1]);
    if (+m[1] <= 12 && +m[2] <= 12) {
      // Ambiguous — prefer the one that's in the future
      const d2 = new Date(+m[3], +m[1] - 1, +m[2]);
      const today = new Date(); today.setHours(0,0,0,0);
      if (d1 >= today) return d1;
      if (d2 >= today) return d2;
    }
    return d1;
  }

  // "June 9, 2026" or "9 June 2026" or "June 9 2026"
  m = s.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
    || s.match(/([a-z]+)\s+(\d{1,2})[,\s]+(\d{4})/i);
  if (m) {
    const parts = m.slice(1);
    const monthStr = parts.find(p => isNaN(+p))?.toLowerCase();
    const nums = parts.filter(p => !isNaN(+p)).map(Number);
    const mIdx = MONTH_NAMES.findIndex(mn => monthStr?.startsWith(mn.slice(0,3)));
    if (mIdx >= 0 && nums.length >= 2) {
      const year = nums.find(n => n > 1000) || new Date().getFullYear();
      const day = nums.find(n => n <= 31 && n !== year);
      if (day && year) return new Date(year, mIdx, day);
    }
  }

  // Fallback: try native Date.parse (may still work for some formats)
  const native = new Date(s);
  if (!isNaN(native)) return native;
  return null;
}

function sanitizeDueDate(dateStr, index) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + 90 * 86400000); // allow up to 90 days out
  const parsed = parseDateFlexible(dateStr);
  if (parsed && parsed >= today && parsed <= maxDate) return skipWeekend(parsed).toISOString().split('T')[0];
  // Fallback: pre-computed cadence dates
  const fallback = new Date(today);
  fallback.setDate(today.getDate() + ([3, 7, 14][index] ?? 7));
  return skipWeekend(fallback).toISOString().split('T')[0];
}

export function parseActivitiesFromPlan(planText) {
  const activities = [];

  // Split on every "### Activity N" boundary so each chunk is one activity block
  const chunks = planText.split(/(?=###\s+Activity\s+\d+)/i).filter(c => /###\s+Activity\s+\d+/i.test(c));

  for (const chunk of chunks) {
    // Header: "### Activity N: [type] [dash] [summary]"  — allow any dash variant, bold markers, flexible spacing
    const headerMatch = chunk.match(
      /###\s+Activity\s+\d+[:\s*]*\*{0,2}(Phone\s*Call|Email|Meeting)\*{0,2}\s*[—–\-]+\s*(.+)/i
    );
    if (!headerMatch) continue; // skip if no activity header at all

    const rawType = headerMatch[1].replace(/\s+/g, ' ').trim();
    const activityType = /phone/i.test(rawType) ? 'Phone Call'
      : /email/i.test(rawType) ? 'Email'
      : 'Meeting';
    const summary = headerMatch[2].replace(/\*+/g, '').trim().slice(0, 60);

    // Due date — accept any format the model writes after "Due:" or "Due Date:"
    const dueMatch = chunk.match(/\*{0,2}Due(?:\s*[Dd]ate)?\*{0,2}:\s*([^\n]+)/i);
    // Extract whatever date string follows and let parseDateFlexible handle it
    const dueDate = sanitizeDueDate(dueMatch?.[1]?.trim() || '', activities.length);

    // Notes — everything after the "Notes:" line (any capitalization, optional bold)
    const notesMatch = chunk.match(/\*{0,2}Notes?\*{0,2}:\s*([\s\S]+)/i);
    const notes = notesMatch ? notesMatch[1].trim() : '';

    activities.push({ activityType, summary, dueDate, notes });
  }

  return activities;
}

// ── Portfolio Scanner ─────────────────────────────────────────────────────────

export const PORTFOLIO_SYSTEM_PROMPT = `You are a senior Customer Success Manager at Odoo Middle East analyzing your entire subscription portfolio.
Your job: identify which accounts need action RIGHT NOW and which have upsell potential, based on hard data from chatter.

ODOO KNOWLEDGE:
- Subscriptions renew via the "Renew" button on the Sales Order → generates Renewal Quotation → must be confirmed + invoiced + paid
- Overdue = next_invoice_date already passed, database may auto-close based on plan settings
- Upsell = click Upsell on SO → new quotation with prorated products → send to customer
- Close reasons: customer-initiated or CSM-initiated. Once Churned, subscription is lost.
- Recurring Plans: Monthly / Yearly / 2Y / 3Y / 5Y. Longer plans = better retention, cheaper per month for customer
- User license expansion: if customer near capacity, propose additional seats proactively
- Modules to upsell depending on industry: HR/Payroll, Helpdesk, Project, Inventory, Accounting, Manufacturing, eCommerce

PRIORITIZATION RULES:
- Every "Why" and "Say" field MUST cite specific chatter data (date, quote, author). Never invent facts.
- Inbound customer message that was never replied to → TIER 1 regardless of renewal date
- Colleague/support escalation never resolved → TIER 1
- CSM sending same template email repeatedly with no response → flag as "generic outreach — change approach, use phone"
- Accounts with daysToRenewal < 0 are overdue → TIER 1 or 2 based on value
- Accounts with NO chatter history → flag as "no relationship built — cold first contact"
- Sort within each tier: highest monthly value first
- TIMELINE AWARENESS: Read chatter as a timeline. If an issue was raised and later resolved/fixed/closed in newer messages → it's RESOLVED. Only flag issues as open if the most recent message about that topic confirms it's still pending.
- Tone: warm and consultative. Match customer language (English or Arabic) based on their chatter.`;

export function buildPortfolioPrompt(profiles) {
  const today = new Date().toISOString().slice(0, 10);

  const accountsText = profiles.map((p, i) => {
    const renewalStr = p.daysToRenewal == null ? 'renewal date unknown'
      : p.daysToRenewal < 0 ? `OVERDUE by ${Math.abs(p.daysToRenewal)} days`
      : p.daysToRenewal === 0 ? 'renews TODAY'
      : `renews in ${p.daysToRenewal} days (${p.nextInvoice})`;

    const contactStr = p.daysSinceLast == null ? 'NO CONTACT EVER'
      : `last contact ${p.daysSinceLast} days ago`;

    const msgsText = p.recentMsgs.length
      ? p.recentMsgs.map(m => `  > ${m}`).join('\n')
      : '  (no chatter history)';

    return `### ${i + 1}. ${p.partner} | ${p.so}
Monthly: $${p.monthly} | ${renewalStr} | ${contactStr} | ${p.msgCount} total messages
Scheduled activity: "${p.activity || 'none'}" due ${p.actDeadline || 'none'}
Recent chatter:
${msgsText}`;
  }).join('\n\n');

  return `Today: ${today}
Total accounts: ${profiles.length}

Analyze every account below and output a prioritized portfolio report in this EXACT format:

## TIER 1 — Act Today
(Accounts: renewing today/overdue/inbound unanswered message/unresolved escalation)
For each:
### [Customer] — $[monthly]/mo | [renewal status]
**Why:** [specific signal from chatter with date/quote]
**Action:** [exactly what to do — call/reply/resolve X]
**Say:** [one specific thing to reference from their chatter to open the conversation]

## TIER 2 — This Week
(Accounts: renewing in 2–14 days or with high-value open issues)
Same format as TIER 1.

## TIER 3 — Next 30 Days
(Accounts: renewing in 15–45 days)
Brief bullet per account: **[Customer]** — $[monthly]/mo, renews [date]. [One sentence signal.]

## TIER 4 — Upsell Pipeline
(Accounts: healthy, high value, showing expansion signals from chatter or high contract value)
Brief bullet per account: **[Customer]** — $[monthly]/mo. [Expansion signal or reason.]

## Summary Stats
- Total accounts analyzed: [N]
- Accounts needing action today: [N]
- Total MRR at risk (TIER 1+2): $[X]
- Top upsell opportunity: [Customer name + why]

---

## FULL ACCOUNT DATA

${accountsText}`;
}
