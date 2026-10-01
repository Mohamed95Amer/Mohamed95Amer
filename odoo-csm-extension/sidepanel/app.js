// Shared with the service worker — the panel used to carry its own weaker
// duplicate parser (ISO-only dates, no weekend skip), so clicking "Continue"
// mid-stream produced different due dates than waiting for completion.
import { parseActivitiesFromPlan, verifyActivityReferences } from '../lib/ollama.js';

// ---- State ----
const STATE = {
  IDLE: 'idle',
  EXTRACTING: 'extracting',
  EXTRACTED: 'extracted',
  RESEARCHING: 'researching',
  ANALYZING: 'analyzing',
  REVIEW: 'review',
  EXECUTING: 'executing',
  COMPLETE: 'complete',
  SETTINGS: 'settings',
  ERROR: 'error',
  DASHBOARD: 'dashboard',
  PORTFOLIO_SCANNING: 'portfolio_scanning',
  PORTFOLIO_COMPLETE: 'portfolio_complete',
  FEEDBACK: 'feedback'
};

const PHASE_MAP = {
  [STATE.IDLE]: null,
  [STATE.EXTRACTING]: 'extract',
  [STATE.EXTRACTED]: 'extract',
  [STATE.RESEARCHING]: 'research',
  [STATE.ANALYZING]: 'analyze',
  [STATE.REVIEW]: 'review',
  [STATE.EXECUTING]: 'execute',
  [STATE.COMPLETE]: 'execute',
  [STATE.SETTINGS]: null,
  [STATE.ERROR]: null,
  [STATE.DASHBOARD]: null,
  [STATE.PORTFOLIO_SCANNING]: null,
  [STATE.PORTFOLIO_COMPLETE]: null,
  [STATE.FEEDBACK]: null
};

const PHASE_ORDER = ['extract', 'research', 'analyze', 'review', 'execute'];

const initialState = {
  phase: STATE.IDLE,
  currentTabId: null,
  odooData: null,
  researchData: null,
  companyProfile: null,
  planText: '',
  activities: [],
  researchProgress: {},
  executionResults: [],
  error: null,
  activityError: null,
  prevPhase: null,
  ollamaStatus: null,
  navPending: false,
  deepSearch: false,
  portfolioProgress: {},
  portfolioText: '',
  portfolioCount: 0,
  quickBrief: null,         // { companyOverview, painPoints, industry, project, contact }
  quickBriefLoading: false,
  quickBriefError: null,
  projectInfo: null,        // { activeProjects: [...] }
  analyzingStartMs: null,
  referenceChecks: [],      // [{verified: true|false|null, reference}] per activity
  coverage: null,           // data-coverage flags from the worker
  generatedAt: null,        // plan timestamp — stale restored plans must say so
  portfolioGeneratedAt: null,
  activityFeedback: {},     // { index: 'up' | 'down' } — feeds the memory layer
  memoryKey: null,
  ollamaUrl: '',            // configured URL, for honest error messages
  analyzeModel: null,       // { model, degraded, preferred, phase, reason }
  drafts: {}                // { activityIndex: { loading, text, error } }
};

let appState = { ...initialState };

// ── Port keepalive — keeps service worker alive during long Ollama operations ──
let _swPort = null;
function ensureSWPort() {
  if (_swPort) return;
  try {
    _swPort = chrome.runtime.connect({ name: 'panel-keepalive' });
    _swPort.onDisconnect.addListener(() => {
      _swPort = null;
      // SW was killed mid-analysis — show recovery UI
      if (appState.phase === STATE.ANALYZING) {
        transition(STATE.ERROR, { error: 'AI service was restarted mid-generation. Click Retry to try again.' });
      }
    });
  } catch {}
}
ensureSWPort();

// ── Ping keepalive — sends SW_KEEPALIVE every 20s during long operations ──
// Chrome kills idle SWs after ~30s; periodic messages prevent that.
let _keepaliveInterval = null;
function startSWKeepalive() {
  if (_keepaliveInterval) return;
  _keepaliveInterval = setInterval(() => {
    if ([STATE.ANALYZING, STATE.RESEARCHING].includes(appState.phase)) {
      chrome.runtime.sendMessage({ type: 'SW_KEEPALIVE' }).catch(() => {});
    } else {
      stopSWKeepalive();
    }
  }, 20000);
}
function stopSWKeepalive() {
  if (_keepaliveInterval) { clearInterval(_keepaliveInterval); _keepaliveInterval = null; }
}

// ---- DOM refs ----
const contentEl = document.getElementById('content');
const phaseDots = document.querySelectorAll('.phase');
const phaseConnectors = document.querySelectorAll('.phase-connector');

// ---- Phase bar update ----
function updatePhaseBar(currentPhaseName) {
  const current = PHASE_ORDER.indexOf(currentPhaseName);
  phaseDots.forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i < current) dot.classList.add('done');
    else if (i === current) dot.classList.add('active');
    // a11y: expose the active step to screen readers
    if (i === current) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  });
  phaseConnectors.forEach((c, i) => {
    c.classList.toggle('done', i < current);
  });
}

// ---- Transitions ----
function transition(newPhase, updates = {}) {
  appState = { ...appState, ...updates, phase: newPhase };
  // Always update — a null phase must CLEAR the bar (it used to stay
  // highlighted on Settings/Error/Feedback screens)
  updatePhaseBar(PHASE_MAP[newPhase] ?? null);
  render();
}

// ---- Render dispatcher ----
function render() {
  contentEl.innerHTML = '';
  switch (appState.phase) {
    case STATE.IDLE:        renderIdle(); break;
    case STATE.EXTRACTING:  renderExtracting(); break;
    case STATE.EXTRACTED:   renderExtracted(); break;
    case STATE.RESEARCHING: renderResearching(); break;
    case STATE.ANALYZING:   renderAnalyzing(); break;
    case STATE.REVIEW:      renderReview(); break;
    case STATE.EXECUTING:   renderExecuting(); break;
    case STATE.COMPLETE:    renderComplete(); break;
    case STATE.SETTINGS:           renderSettings(); break;
    case STATE.ERROR:              renderError(); break;
    case STATE.DASHBOARD:          renderDashboard(); break;
    case STATE.PORTFOLIO_SCANNING: renderPortfolioScanning(); break;
    case STATE.PORTFOLIO_COMPLETE: renderPortfolioComplete(); break;
    case STATE.FEEDBACK:           renderFeedback(); break;
  }
}

// ---- Screen renderers ----

function renderIdle() {
  updatePhaseBar(null);
  const ollamaWarning = appState.ollamaStatus === false
    ? `<div class="warning-banner">Local Ollama server unreachable (${esc(appState.ollamaUrl || 'not configured')}) — <a href="#" id="setup-link">open Settings</a></div>`
    : '';
  contentEl.innerHTML = `
    <div class="idle-screen screen">
      ${errorBanner()}
      ${ollamaWarning}
      <div class="idle-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="7" r="4"/>
          <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8"/>
        </svg>
      </div>
      <h2>CSM Copilot</h2>
      <p>Open a subscription or Sales Order page in Odoo to get started.</p>
      <button class="btn btn-secondary btn-sm" id="open-settings-idle">⚙ Settings</button>
    </div>`;
  document.getElementById('open-settings-idle')?.addEventListener('click', () => transition(STATE.SETTINGS));
  document.getElementById('setup-link')?.addEventListener('click', (e) => { e.preventDefault(); transition(STATE.SETTINGS); });
  bindErrorBanner();
}

function renderExtracting() {
  contentEl.innerHTML = `
    <div class="loading-screen screen">
      <div class="loading-row">
        <div class="loading-icon"><div class="spinner"></div></div>
        <span class="loading-label active">Reading Odoo subscription page…</span>
      </div>
    </div>`;
}

function renderExtracted() {
  const d = appState.odooData;
  const db = d.dbInfo;

  const enrichErr = appState.enrichmentError;
  const utilPct = db?.utilization;
  const utilHealth = utilPct == null ? null
    : utilPct < 50  ? { label: 'At-Risk',  cls: 'util-low' }
    : utilPct < 70  ? { label: 'Moderate', cls: 'util-mid' }
    :                 { label: 'Healthy',  cls: 'util-high' };

  const utilizationHtml = utilPct != null
    ? `<div class="util-bar-wrap">
        <div class="util-bar-label">
          <span>User Utilization</span>
          <strong>${utilPct}%</strong> <span style="font-size:13px;font-weight:700;margin-left:6px;color:${utilPct < 50 ? 'var(--danger)' : utilPct < 70 ? 'var(--warning)' : 'var(--success)'}">${utilHealth.label}</span>
        </div>
        <div class="util-bar-track">
          <div class="util-bar-fill ${utilHealth.cls}"
               style="width:${Math.min(utilPct,100)}%"></div>
        </div>
        <div class="util-bar-sub">${db.activeUsersList?.slice(0,5).join(', ')} active / ${db.regularUsers} licensed</div>
      </div>`
    : enrichErr
      ? `<div class="util-loading" style="color:var(--warning)" title="${esc(enrichErr)}">Utilization unavailable — ${esc(enrichErr.slice(0, 60))}</div>`
      : `<div class="util-loading" id="util-loading">Loading utilization…</div>`;

  // Quick Brief panel — AI-generated structured summary
  const qb = appState.quickBrief;
  const briefHtml = qb
    ? `<div class="quick-brief">
        <div class="quick-brief-header">
          <span>🧠 Quick Brief</span>
          <button class="btn-icon" id="brief-refresh-btn" title="Regenerate">↻</button>
        </div>
        <div class="brief-row"><span class="brief-label">Industry</span><span class="brief-value">${esc(qb.industry || '—')}</span></div>
        <div class="brief-row"><span class="brief-label">Company</span><span class="brief-value">${esc(qb.companyOverview || '—')}</span></div>
        <div class="brief-row"><span class="brief-label">Pain Points</span><span class="brief-value">${esc(qb.painPoints || '—')}</span></div>
        <div class="brief-row"><span class="brief-label">Project</span><span class="brief-value">${esc(qb.project || '—')}</span></div>
        <div class="brief-row"><span class="brief-label">Contact</span><span class="brief-value">${esc(qb.contact || '—')}</span></div>
      </div>`
    : appState.quickBriefLoading
      ? `<div class="quick-brief loading">
          <div class="quick-brief-header"><span>🧠 Quick Brief</span></div>
          <div class="brief-loading-row"><span class="spinner"></span> Generating brief…</div>
        </div>`
      : appState.quickBriefError
        ? `<div class="quick-brief error">
            <div class="quick-brief-header"><span>🧠 Quick Brief</span><button class="btn-icon" id="brief-refresh-btn">↻</button></div>
            <div class="brief-error">Could not generate brief — ${esc(appState.quickBriefError)}</div>
          </div>`
        : `<div class="quick-brief">
            <div class="quick-brief-header"><span>🧠 Quick Brief</span></div>
            <button class="btn btn-secondary btn-sm btn-full" id="brief-generate-btn">Generate AI Brief</button>
          </div>`;

  contentEl.innerHTML = `
    <div class="screen">
      ${errorBanner()}
      <div class="customer-card">
        <div class="customer-name">${esc(d.customerName || 'Unknown customer')}</div>
        <div class="customer-meta">
          <span class="meta-badge">${esc(d.soNumber || '')}</span>
          ${d.subscriptionPlan ? `<span class="meta-badge">${esc(d.subscriptionPlan)}</span>` : ''}
          ${d.recurringAmount ? `<span class="meta-badge">${esc(d.recurringAmount)} ${esc(d.currency || '')}</span>` : ''}
          ${d.hosting ? `<span class="meta-badge">${esc(d.hosting)}</span>` : ''}
        </div>
      </div>
      <div class="overview-section">
        ${d.renewalDate ? `<div class="overview-row"><span class="overview-label">Renewal</span><span class="${d.daysUntilRenewal != null && d.daysUntilRenewal < 60 ? 'renewal-urgent' : ''}">${esc(d.renewalDate)}${d.daysUntilRenewal != null ? ` <em>(${d.daysUntilRenewal}d)</em>` : ''}</span></div>` : ''}
        ${d.dbCount ? `<div class="overview-row"><span class="overview-label">Databases</span><span>${d.dbCount}</span></div>` : ''}
        ${d.chatHistory?.length ? `<div class="overview-row"><span class="overview-label">Log Entries</span><span>${d.chatHistory.length}</span></div>` : ''}
        ${d.assignedSalesperson ? `<div class="overview-row"><span class="overview-label">Salesperson</span><span>${esc(d.assignedSalesperson)}</span></div>` : ''}
      </div>
      ${utilizationHtml}
      ${briefHtml}
      <div id="account-memory-slot"></div>
      ${(!d.notesContent && (d.chatHistory || []).length < 3)
        ? `<div class="warning-banner">Low data on this account (no notes, little chatter) — expect a thin, generic plan.</div>`
        : ''}
      <div class="deep-search-row">
        <label class="toggle-label" for="deep-search-toggle">
          <input type="checkbox" id="deep-search-toggle" ${appState.deepSearch ? 'checked' : ''}>
          <span>Deep Search</span>
        </label>
        <span class="toggle-hint">Adds website research + tasks/timesheets (slower)</span>
      </div>
      <button class="btn btn-primary btn-full" id="start-research-btn">
        Start Research →
      </button>
    </div>`;
  document.getElementById('deep-search-toggle')?.addEventListener('change', (e) => {
    appState.deepSearch = e.target.checked;
    chrome.storage.sync.set({ deepSearch: appState.deepSearch });
  });
  document.getElementById('start-research-btn')?.addEventListener('click', startResearch);

  // Surface prior reviews of this account (the learning layer, made visible)
  chrome.runtime.sendMessage({ type: 'GET_ACCOUNT_MEMORY', payload: { tabId: appState.currentTabId } }, (res) => {
    const mem = res?.data;
    const slot = document.getElementById('account-memory-slot');
    if (!slot || !mem?.entries?.length) return;
    const e = mem.entries[0];
    const when = (e.date || '').slice(0, 10);
    const created = (e.finalActivities || []).length;
    const upCount = Object.values(e.feedback || {}).filter(v => v === 'up').length;
    const outcomes = (e.outcomes || []);
    const done = outcomes.filter(o => o.state === 'done').length;
    const overdue = outcomes.filter(o => o.state === 'overdue').length;
    const outcomeStr = outcomes.length
      ? ` · ${done} completed${overdue ? `, ${overdue} still overdue` : ''}`
      : '';
    slot.innerHTML = `
      <div class="memory-panel">
        <div class="memory-panel-head">🧠 Prior review — ${esc(when)}</div>
        <div class="memory-panel-row">Created ${created} activit${created === 1 ? 'y' : 'ies'}${upCount ? ` · ${upCount} rated 👍` : ''}${outcomeStr}</div>
        <div class="memory-panel-row muted">Health then: ${esc(e.healthTier || 'unknown')}. The AI uses this history to avoid repeating itself.</div>
      </div>`;
  });

  // Quick Brief buttons
  const triggerBrief = () => {
    appState.quickBrief = null;
    appState.quickBriefError = null;
    appState.quickBriefLoading = true;
    renderExtracted();
    chrome.runtime.sendMessage({ type: 'START_QUICK_BRIEF', payload: { tabId: appState.currentTabId } });
  };
  document.getElementById('brief-generate-btn')?.addEventListener('click', triggerBrief);
  document.getElementById('brief-refresh-btn')?.addEventListener('click', triggerBrief);

  // Auto-generate brief on first render if not already loaded
  if (!appState.quickBrief && !appState.quickBriefLoading && !appState.quickBriefError && d.notesContent) {
    triggerBrief();
  }
}

function renderResearching() {
  const p = appState.researchProgress;
  const steps = [
    { key: 'chatter', label: 'Loading full chatter history' },
    { key: 'sales_history', label: 'Order history & previous sub chatter' },
    { key: 'partner_intel', label: 'Customer 360 — opportunities, invoices, contacts' },
    ...(appState.deepSearch ? [
      { key: 'google_search', label: 'Finding company website' },
      { key: 'deep_intel', label: 'Tasks & Timesheets (RPC)' }
    ] : [])
  ];

  const rows = steps.map(s => {
    const status = p[s.key] || 'pending';
    let icon;
    if (status === 'running') icon = `<div class="spinner"></div>`;
    else if (status === 'done') icon = `<span class="check-icon">✓</span>`;
    else if (status === 'error' || status === 'login_wall' || status === 'not_found') icon = `<span style="color:#f0a500">—</span>`;
    else icon = `<div class="pending-dot"></div>`;

    const labelClass = status === 'running' ? 'active' : '';
    const detail = status === 'login_wall' ? ' (login required — skipped)' :
                   status === 'not_found' ? ' (not found — skipped)' :
                   status === 'error' ? ' (error — skipped)' :
                   status === 'done' && s.key === 'chatter' && p.chatter_count ? ` (${p.chatter_count} messages)` :
                   status === 'done' && s.key === 'sales_history' && p.sales_history_count ? ` (${p.sales_history_count} notes)` :
                   status === 'done' && s.key === 'partner_intel' && p.partner_intel_counts ? ` (${p.partner_intel_counts.opps} opps · ${p.partner_intel_counts.invoices} inv · ${p.partner_intel_counts.contacts} contacts)` :
                   status === 'done' && s.key === 'deep_intel' && p.deep_intel_counts ? ` (${p.deep_intel_counts.orders} orders · ${p.deep_intel_counts.tasks} tasks · ${p.deep_intel_counts.hours}h)` : '';

    return `<div class="loading-row">
      <div class="loading-icon">${icon}</div>
      <span class="loading-label ${labelClass}">${esc(s.label)}${detail}</span>
    </div>`;
  }).join('');

  contentEl.innerHTML = `<div class="loading-screen screen">${rows}</div>`;
}

function modelIndicatorHtml() {
  const m = appState.analyzeModel;
  if (!m) return '';
  if (m.degraded) {
    const why = m.phase === 'fallback'
      ? `${esc(m.reason || 'primary model failed')} — using a faster model`
      : `preferred model "${esc(m.preferred || '')}" not on the server`;
    return `<div class="warning-banner">⚠ Reduced plan quality: ${why}. Running <strong>${esc(m.model)}</strong>.</div>`;
  }
  return `<div class="model-chip">Generating with <strong>${esc(m.model)}</strong></div>`;
}

function planLooksComplete(planText) {
  return (planText || '').includes('## Recommended Activities') &&
    parseActivitiesFromPlan(planText || '').length >= 1;
}

// Scoped streaming update — touches ONLY the plan box + footer buttons.
// The old code rebuilt the entire screen ~7×/sec, resetting scroll position
// and text selection for the whole multi-minute generation.
function updateStreamingPlan() {
  if (appState.phase !== STATE.ANALYZING) return;
  const box = document.getElementById('streaming-plan');
  if (!box) { renderAnalyzing(); return; }

  const elapsedMs = appState.analyzingStartMs ? Date.now() - appState.analyzingStartMs : 0;
  const isStalled = elapsedMs > 120000 && !appState.planText?.trim();

  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = renderMarkdown(
    appState.planText || (isStalled ? 'No response yet — the model may be slow or overloaded.' : 'Generating plan…')
  );
  if (atBottom) box.scrollTop = box.scrollHeight; // follow the tail only if the user was already there

  const complete = planLooksComplete(appState.planText);
  box.classList.toggle('cursor-blink', !complete);
  const continueBtn = document.getElementById('plan-continue-btn');
  if (continueBtn) continueBtn.style.display = complete ? '' : 'none';
  const retryBtn = document.getElementById('retry-analysis-btn');
  if (retryBtn) retryBtn.style.display = isStalled ? '' : 'none';

  const elapsedEl = document.getElementById('analyze-elapsed');
  if (elapsedEl && appState.analyzingStartMs) {
    const s = Math.floor(elapsedMs / 1000);
    elapsedEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

function renderAnalyzing() {
  const profileSection = appState.companyProfile
    ? renderProfileChips(appState.companyProfile)
    : '';

  contentEl.innerHTML = `
    <div class="screen">
      ${profileSection}
      <div id="model-indicator">${modelIndicatorHtml()}</div>
      <div class="summary-section">
        <div class="label">Action Plan <span class="elapsed-badge" id="analyze-elapsed"></span></div>
        <div class="plan-box cursor-blink" id="streaming-plan" aria-live="polite" aria-atomic="false"></div>
      </div>
      <button class="btn btn-primary btn-full" id="plan-continue-btn" style="display:none">Continue to Review →</button>
      <button class="btn btn-secondary btn-full" id="retry-analysis-btn" style="display:none;margin-top:8px">↺ Retry plan generation</button>
      <button class="btn btn-secondary btn-full btn-sm" id="cancel-analysis-btn" style="margin-top:8px">✕ Cancel</button>
    </div>`;

  // Per-second elapsed/stall refresh — scoped, no full re-render
  clearInterval(appState._elapsedTimer);
  appState._elapsedTimer = setInterval(() => {
    if (appState.phase !== STATE.ANALYZING) { clearInterval(appState._elapsedTimer); return; }
    updateStreamingPlan();
  }, 1000);

  document.getElementById('plan-continue-btn')?.addEventListener('click', () => {
    // Same parser as the worker (weekend-skip, 90-day clamp, JSON-first) —
    // the panel used to apply a weaker duplicate here
    transition(STATE.REVIEW, {
      planText: appState.planText,
      activities: parseActivitiesFromPlan(appState.planText),
      referenceChecks: verifyActivityReferences(parseActivitiesFromPlan(appState.planText), appState.odooData, appState.researchData),
      generatedAt: Date.now(),
      error: null
    });
  });

  document.getElementById('retry-analysis-btn')?.addEventListener('click', () => {
    appState.analyzingStartMs = Date.now();
    appState.planText = '';
    ensureSWPort();
    chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      payload: { tabId: appState.currentTabId, odooData: appState.odooData, researchData: appState.researchData }
    });
    renderAnalyzing();
  });

  document.getElementById('cancel-analysis-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CANCEL_ANALYSIS' });
    transition(STATE.EXTRACTED, { planText: '', analyzingStartMs: null });
  });

  updateStreamingPlan();
}

function coverageChips() {
  const c = appState.coverage;
  if (!c) return '';
  const label = { notes: 'Notes', chatter: 'Chatter', salesHistory: 'Sales history', utilization: 'Utilization',
    invoices: 'Invoices', contacts: 'Contacts', tickets: 'Helpdesk', mrrTrend: 'MRR trend', website: 'Web research', deepIntel: 'Deep intel' };
  const chips = Object.entries(c)
    .map(([k, v]) => {
      if (v === 'error') return `<span class="chip chip-cov-err" title="Read FAILED (ACL or Odoo field change) — not the same as 'no data'">⚠ ${esc(label[k] || k)}</span>`;
      return `<span class="chip ${v ? 'chip-cov-on' : 'chip-cov-off'}" title="${v ? 'Included in this analysis' : 'NOT available for this analysis'}">${v ? '✓' : '✗'} ${esc(label[k] || k)}</span>`;
    })
    .join('');
  return `<div class="profile-chips coverage-chips">${chips}</div>`;
}

function generatedAtBanner() {
  if (!appState.generatedAt) return '';
  const ageMs = Date.now() - appState.generatedAt;
  const stale = ageMs > 36 * 3600 * 1000;
  const when = new Date(appState.generatedAt).toLocaleString();
  return `<div class="generated-at ${stale ? 'stale' : ''}">Plan generated ${esc(when)}${stale ? ' — ⚠ may be stale, consider re-running' : ''}</div>`;
}

function renderReview() {
  const profileSection = appState.companyProfile
    ? renderProfileChips(appState.companyProfile)
    : '';

  const activityCards = appState.activities.map((act, i) => renderActivityCard(act, i)).join('');

  contentEl.innerHTML = `
    <div class="screen">
      ${errorBanner()}
      ${generatedAtBanner()}
      ${profileSection}
      ${coverageChips()}
      <div class="summary-section">
        <div class="label">Plan Summary
          <button class="btn btn-secondary btn-sm" id="copy-plan-btn" style="float:right">📋 Copy plan</button>
        </div>
        <div class="plan-box" style="max-height:200px">${renderMarkdown(appState.planText)}</div>
      </div>
      <div class="activities-section">
        <h3>Activities to Create (${appState.activities.length})</h3>
        <div id="activity-list">${activityCards}</div>
        <button class="add-activity-btn" id="add-activity-btn">+ Add activity</button>
      </div>
      <div class="actions-footer">
        <button class="btn btn-success btn-full" id="create-activities-btn" ${appState.activities.length === 0 ? 'disabled' : ''}>
          ✓ Create ${appState.activities.length} Activit${appState.activities.length === 1 ? 'y' : 'ies'} in Odoo
        </button>
        <div class="footer-hint">Creating also copies the full plan to your clipboard.</div>
        <button class="btn btn-secondary btn-full btn-sm" id="restart-btn">↩ Start Over</button>
      </div>
    </div>`;

  document.getElementById('copy-plan-btn')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(appState.planText); e.target.textContent = '✅ Copied'; } catch {}
  });
  document.getElementById('add-activity-btn')?.addEventListener('click', addBlankActivity);
  document.getElementById('create-activities-btn')?.addEventListener('click', createActivities);
  document.getElementById('restart-btn')?.addEventListener('click', restart);
  bindActivityCardEvents();
  bindErrorBanner();
}

function renderActivityCard(act, index) {
  const badgeClass = act.activityType === 'Phone Call' ? 'badge-call' :
                     act.activityType === 'Email' ? 'badge-email' : 'badge-meeting';
  const refCheck = appState.referenceChecks?.[index];
  const refBadge = refCheck?.verified === false
    ? `<span class="ref-badge ref-bad" title="The 'Reference:' in the notes was NOT found in the account data — possible hallucination, verify before calling">⚠ reference not found in data</span>`
    : refCheck?.verified === true
      ? `<span class="ref-badge ref-ok" title="The cited reference appears in the account data">✓ grounded</span>`
      : '';
  const fb = appState.activityFeedback[index];
  return `
    <div class="activity-card" data-index="${index}">
      <div class="activity-card-header">
        <select class="activity-type-select ${badgeClass}" data-index="${index}" title="Activity type">
          ${['Phone Call', 'Email', 'Meeting'].map(t => `<option value="${t}" ${act.activityType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        ${refBadge}
        <div class="activity-card-actions">
          <button class="btn-icon fb-up ${fb === 'up' ? 'active' : ''}" data-index="${index}" aria-pressed="${fb === 'up'}" aria-label="Good suggestion — the AI learns from this" title="Good suggestion — the AI learns from this">👍</button>
          <button class="btn-icon fb-down ${fb === 'down' ? 'active' : ''}" data-index="${index}" aria-pressed="${fb === 'down'}" aria-label="Bad suggestion — the AI avoids this pattern next time" title="Bad suggestion — the AI avoids this pattern next time">👎</button>
          <button class="btn-icon danger remove-activity" data-index="${index}" aria-label="Remove activity" title="Remove">✕</button>
        </div>
      </div>
      <div class="activity-field">
        <label>Summary (max 60 chars)</label>
        <input type="text" class="activity-summary" data-index="${index}" maxlength="60"
               value="${esc(act.summary)}" placeholder="Activity summary…">
      </div>
      <div class="activity-field">
        <label>Due Date</label>
        <input type="date" class="activity-date" data-index="${index}" value="${esc(act.dueDate || '')}">
      </div>
      ${act.with ? `<div class="activity-with">👤 ${esc(act.with)}</div>` : ''}
      <div class="activity-field">
        <label>Notes — written into Odoo exactly as below</label>
        <textarea class="activity-notes-edit" data-index="${index}" rows="4">${esc(act.notes || '')}</textarea>
      </div>
      <button class="btn btn-secondary btn-sm draft-msg-btn" data-index="${index}">✍ Draft ${act.activityType === 'Phone Call' ? 'call notes' : act.activityType === 'Email' ? 'email' : 'meeting invite'}</button>
      <div class="draft-box" data-index="${index}">${draftBoxHtml(index)}</div>
    </div>`;
}

function draftBoxHtml(index) {
  const d = appState.drafts[index];
  if (!d) return '';
  if (d.loading) return `<div class="draft-loading"><span class="spinner"></span> Drafting…${d.text ? `<div class="draft-text">${esc(d.text)}</div>` : ''}</div>`;
  if (d.error) return `<div class="draft-error">Draft failed — ${esc(d.error)}</div>`;
  if (d.text) return `<div class="draft-result"><div class="draft-text">${esc(d.text)}</div><button class="btn btn-secondary btn-sm draft-copy-btn" data-index="${index}">📋 Copy draft</button></div>`;
  return '';
}

function refreshDraftBox(index) {
  const box = document.querySelector(`.draft-box[data-index="${index}"]`);
  if (box) { box.innerHTML = draftBoxHtml(index); bindDraftCopy(index); }
}

function bindDraftCopy(index) {
  document.querySelector(`.draft-copy-btn[data-index="${index}"]`)?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(appState.drafts[index]?.text || ''); e.target.textContent = '✅ Copied'; } catch {}
  });
}

function bindActivityCardEvents() {
  document.querySelectorAll('.remove-activity').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.index);
      appState.activities.splice(i, 1);
      appState.referenceChecks?.splice?.(i, 1);
      delete appState.activityFeedback[i];
      transition(STATE.REVIEW);
    });
  });

  document.querySelectorAll('.activity-summary').forEach(input => {
    input.addEventListener('input', () => {
      const i = parseInt(input.dataset.index);
      appState.activities[i].summary = input.value;
    });
  });

  document.querySelectorAll('.activity-date').forEach(input => {
    input.addEventListener('change', () => {
      const i = parseInt(input.dataset.index);
      appState.activities[i].dueDate = input.value;
    });
  });

  // Notes are what actually gets written into Odoo — they must be editable
  document.querySelectorAll('.activity-notes-edit').forEach(ta => {
    ta.addEventListener('input', () => {
      const i = parseInt(ta.dataset.index);
      appState.activities[i].notes = ta.value;
    });
  });

  document.querySelectorAll('.activity-type-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = parseInt(sel.dataset.index);
      appState.activities[i].activityType = sel.value;
    });
  });

  // 👍/👎 — the per-activity signal the memory layer learns from
  const setFb = (i, verdict) => {
    appState.activityFeedback[i] = appState.activityFeedback[i] === verdict ? undefined : verdict;
    transition(STATE.REVIEW);
  };
  document.querySelectorAll('.fb-up').forEach(b => b.addEventListener('click', () => setFb(parseInt(b.dataset.index), 'up')));
  document.querySelectorAll('.fb-down').forEach(b => b.addEventListener('click', () => setFb(parseInt(b.dataset.index), 'down')));

  // Draft a ready-to-send message for one activity (in the customer's language)
  document.querySelectorAll('.draft-msg-btn').forEach(b => b.addEventListener('click', () => {
    const i = parseInt(b.dataset.index);
    appState.drafts[i] = { loading: true, text: '' };
    refreshDraftBox(i);
    chrome.runtime.sendMessage({ type: 'DRAFT_MESSAGE', payload: { tabId: appState.currentTabId, index: i, activity: appState.activities[i] } });
  }));
  Object.keys(appState.drafts).forEach(i => bindDraftCopy(parseInt(i)));
}

function renderExecuting() {
  const rows = appState.activities.map((act, i) => {
    const result = appState.executionResults[i];
    let cls = 'pending', icon = '<div class="pending-dot"></div>', label = act.summary;
    if (result === undefined && i === appState.executionResults.length) {
      cls = 'pending'; icon = '<div class="spinner"></div>';
    } else if (result?.success) {
      cls = 'success'; icon = '✓';
    } else if (result?.success === false) {
      cls = 'error'; icon = '✕'; label += ` — ${result.error || 'failed'}`;
    }
    return `<div class="exec-row ${cls}">${icon} ${esc(label)}</div>`;
  }).join('');

  contentEl.innerHTML = `
    <div class="screen">
      <div class="summary-section">
        <div class="label">Creating Activities in Odoo…</div>
      </div>
      <div class="execution-list">${rows}</div>
    </div>`;
}

function renderComplete() {
  const total = appState.executionResults.length;
  const succeeded = appState.executionResults.filter(r => r?.success).length;
  const failed = total - succeeded;
  const sysError = appState.activityError;

  // esc() on summary/error — both can carry LLM-derived text, and this list
  // was the one innerHTML sink that rendered it unescaped
  const failedDetails = appState.executionResults
    .filter(r => !r?.success)
    .map(r => `<li>${esc(r.summary)}: ${esc(r.error || 'unknown error')}</li>`)
    .join('');

  contentEl.innerHTML = `
    <div class="complete-screen screen">
      <div class="complete-icon">${sysError ? '⚠️' : failed === 0 ? '🎉' : '⚠️'}</div>
      <h2>${succeeded} of ${total} ${total === 1 ? 'activity' : 'activities'} created</h2>
      ${sysError ? `<p style="color:var(--danger);font-size:12px">Error: ${esc(sysError)}</p>` : ''}
      ${failedDetails ? `<ul style="color:var(--danger);font-size:11px;text-align:left">${failedDetails}</ul>` : ''}
      ${!sysError && failed === 0 ? '<p>Activities are now visible in the Odoo chatter.</p>' : ''}
      <p class="memory-note">🧠 This review was saved to account memory — the next analysis of this customer will know what was proposed, what you changed, and what you rated.</p>
      <button class="btn btn-secondary btn-sm" id="copy-plan-complete-btn">📋 Copy plan</button>
      <button class="btn btn-primary btn-sm" id="restart-complete-btn">↩ Start New Analysis</button>
    </div>`;
  document.getElementById('copy-plan-complete-btn')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(appState.planText || ''); e.target.textContent = '✅ Copied'; } catch {}
  });
  document.getElementById('restart-complete-btn')?.addEventListener('click', restart);
}

function renderSettings() {
  contentEl.innerHTML = `
    <div class="settings-screen screen">
      <button class="settings-back" id="settings-back-btn">← Back</button>
      <h2>AI Settings</h2>

      <div class="ollama-setup-box">
        <div class="label">Powered by local Ollama — runs entirely on your company network</div>
        <ol style="padding-left:16px;line-height:2">
          <li>Confirm the server URL with your IT admin (default pre-filled)</li>
          <li>Enter the model name deployed on the server</li>
          <li>Click <strong>Test Connection</strong></li>
        </ol>
      </div>

      <div class="form-group">
        <label>Ollama Server URL</label>
        <input type="text" id="ollama-url" placeholder="http://10.100.255.200:11434" autocomplete="off">
        <span class="form-hint">Base URL of the Ollama server — no trailing slash. Ask IT if this changes.</span>
      </div>

      <div class="form-group">
        <label>Smart Model — action plans &amp; portfolio</label>
        <input type="text" id="ollama-model-smart" placeholder="qwen3.6:latest" autocomplete="off">
        <span class="form-hint">Fallback only — tasks auto-route to the best model on the server (briefs/portfolio → qwen2.5-coder, plans → qwen3.6).</span>
      </div>

      <div class="form-group">
        <label>Fast Model — quick briefs</label>
        <input type="text" id="ollama-model-fast" placeholder="llama3.2:latest" autocomplete="off">
        <span class="form-hint">Fallback only — used when auto-routing finds none of its preferred models on the server.</span>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="test-llm-btn" style="flex:1">Test Connection</button>
        <button class="btn btn-primary btn-sm" id="save-settings-btn" style="flex:1">Save</button>
      </div>

      <div id="llm-status" style="margin-top:8px;font-size:12px"></div>

      <hr style="border:none;border-top:1px solid var(--border-solid);margin:14px 0 4px">
      <h2 style="font-size:14px">Pilot Feedback</h2>

      <div class="form-group">
        <label>Feedback Form URL</label>
        <input type="text" id="feedback-url" placeholder="https://docs.google.com/forms/.../viewform" autocomplete="off">
        <span class="form-hint">Google Form URL where pilot feedback is collected. Each submission appears in the linked Sheet.</span>
      </div>

      <hr style="border:none;border-top:1px solid var(--border-solid);margin:14px 0 4px">
      <h2 style="font-size:14px">Diagnostics</h2>
      <span class="form-hint">A local-only log of recent runs (model used, timings, errors). If something breaks, copy this into your feedback so it can be debugged.</span>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary btn-sm" id="copy-diag-btn" style="flex:1">📋 Copy diagnostics</button>
        <button class="btn btn-secondary btn-sm" id="clear-diag-btn" style="flex:1">Clear</button>
      </div>
      <div id="diag-status" style="margin-top:6px;font-size:12px"></div>

      <div id="settings-saved" class="settings-saved" style="display:none">✓ Saved</div>
    </div>`;

  document.getElementById('copy-diag-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' }, async (res) => {
      const st = document.getElementById('diag-status');
      try {
        const { formatDiagnostics } = await import('../lib/log.js');
        const text = formatDiagnostics(res?.data?.events || [], res?.data?.meta || {});
        await navigator.clipboard.writeText(text);
        if (st) st.innerHTML = `<span style="color:var(--success)">✓ Copied ${res?.data?.events?.length || 0} events to clipboard</span>`;
      } catch (e) {
        if (st) st.innerHTML = `<span style="color:var(--danger)">Could not copy: ${esc(e.message)}</span>`;
      }
    });
  });
  document.getElementById('clear-diag-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_DIAGNOSTICS' }, () => {
      const st = document.getElementById('diag-status');
      if (st) st.textContent = 'Diagnostics cleared.';
    });
  });

  // Populate saved values
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (res?.data) {
      document.getElementById('ollama-url').value         = res.data.ollamaUrl       || 'http://10.100.255.200:11434';
      document.getElementById('ollama-model-smart').value = res.data.ollamaModel     || 'qwen3.6:latest';
      document.getElementById('ollama-model-fast').value  = res.data.ollamaModelFast || 'llama3.2:latest';
      document.getElementById('feedback-url').value       = res.data.feedbackFormUrl || '';
    }
  });

  document.getElementById('settings-back-btn')?.addEventListener('click', () => {
    transition(appState.prevPhase || STATE.IDLE);
  });

  // Test probes the URL in the field WITHOUT saving — a failed experiment no
  // longer overwrites a working configuration.
  document.getElementById('test-llm-btn')?.addEventListener('click', () => {
    const statusEl = document.getElementById('llm-status');
    statusEl.textContent = 'Testing…';
    const url = document.getElementById('ollama-url').value.trim();
    const smart = document.getElementById('ollama-model-smart').value.trim();
    const fast = document.getElementById('ollama-model-fast').value.trim();
    chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA_URL', payload: { url } }, (res) => {
      if (res?.data?.available) {
        const models = res.data.models || [];
        const onServer = (name) => !models.length || models.some(m => m === name || m.startsWith(name + ':'));
        const lines = [`<span style="color:var(--success)">✓ Server reachable (not saved yet — click Save)</span>`];
        for (const [label, name] of [['Smart', smart], ['Fast', fast]]) {
          lines.push(onServer(name)
            ? `<span style="color:var(--success)">✓ ${label}: ${esc(name)}</span>`
            : `<span style="color:var(--warning)">⚠ ${label}: "${esc(name)}" not on server</span>`);
        }
        if (lines.some(l => l.includes('⚠'))) {
          lines.push(`<span style="color:var(--text-muted)">Available: ${esc(models.slice(0, 6).join(', '))}</span>`);
        }
        statusEl.innerHTML = lines.join('<br>');
      } else {
        statusEl.innerHTML = `<span style="color:var(--danger)">✕ Could not reach server</span> — check the URL and that the Ollama service is running`;
      }
    });
  });

  document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('llm-status');
    const payload = {
      ollamaUrl:       document.getElementById('ollama-url').value.trim(),
      ollamaModel:     document.getElementById('ollama-model-smart').value.trim(),
      ollamaModelFast: document.getElementById('ollama-model-fast').value.trim(),
      deepSearch:      appState.deepSearch,
      feedbackFormUrl: document.getElementById('feedback-url').value.trim()
    };

    // If the server URL isn't already covered by a granted host permission,
    // request it now (this click is the required user gesture). Without this a
    // CSM could set a valid intranet IP that passes the allowlist but then
    // silently fails every fetch because the manifest never granted that host.
    try {
      const origin = new URL(payload.ollamaUrl).origin + '/*';
      const already = await chrome.permissions.contains({ origins: [origin] }).catch(() => true);
      if (!already) {
        const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
        if (!granted) {
          statusEl.innerHTML = `<span style="color:var(--warning)">⚠ Saved, but host permission for ${esc(new URL(payload.ollamaUrl).host)} was not granted — the extension can't reach it until you allow it.</span>`;
        }
      }
    } catch { /* invalid URL handled by the worker-side validator below */ }

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload }, (res) => {
      if (res && res.success === false) {
        // e.g. the intranet allowlist rejected a public host
        statusEl.innerHTML = `<span style="color:var(--danger)">✕ Not saved: ${esc(res.error || 'rejected')}</span>`;
        return;
      }
      appState.ollamaUrl = payload.ollamaUrl;
      const el = document.getElementById('settings-saved');
      if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2000); }
    });
  });
}

// ── Feedback screen ──────────────────────────────────────────────────────────
function renderFeedback() {
  const phaseLabel = appState.phase === STATE.FEEDBACK ? 'Feedback' : appState.phase;
  const customerCtx = appState.odooData?.customerName
    ? `${appState.odooData.customerName} / ${appState.odooData.soNumber || 'unknown SO'}`
    : 'No customer in context';

  contentEl.innerHTML = `
    <div class="feedback-screen screen">
      <button class="settings-back" id="feedback-back-btn">← Back</button>
      <div class="feedback-header">
        <h2>Send Feedback</h2>
        <p>Help shape the Copilot. Bugs, suggestions, missed context, hallucinations — all welcome.</p>
      </div>

      <div class="feedback-context">
        <div class="label">Context</div>
        Screen: <strong>${esc(phaseLabel)}</strong><br>
        Version: <strong id="fb-version">…</strong>
        <label class="toggle-label" style="margin-top:6px;display:flex;gap:6px">
          <input type="checkbox" id="fb-include-customer">
          <span>Attach customer context (${esc(customerCtx)}) — sent to the Google Form</span>
        </label>
      </div>

      <div class="form-group">
        <label>Your name</label>
        <input type="text" id="fb-name" placeholder="So Mostafa knows who you are" autocomplete="off">
      </div>

      <div class="form-group">
        <label>Category</label>
        <select id="fb-category">
          <option value="Bug">🐛 Bug — something broken</option>
          <option value="Hallucination">🤖 Hallucination — AI got facts wrong</option>
          <option value="Missed Context">🎯 Missed Context — should've considered X</option>
          <option value="UX">🎨 UX — UI/usability issue</option>
          <option value="Feature Request">✨ Feature Request</option>
          <option value="Praise">🎉 Praise — worked well</option>
          <option value="Other">💬 Other</option>
        </select>
      </div>

      <div class="form-group">
        <label>Severity</label>
        <select id="fb-severity">
          <option value="Low">Low — minor / nice-to-fix</option>
          <option value="Medium" selected>Medium — should fix soon</option>
          <option value="High">High — blocking my work</option>
        </select>
      </div>

      <div class="form-group">
        <label>What happened?</label>
        <textarea id="fb-message" class="feedback-textarea" placeholder="Describe what you saw, what you expected, and steps to reproduce if it's a bug."></textarea>
      </div>

      <button class="btn btn-primary btn-full" id="fb-submit-btn">Submit Feedback</button>
      <div id="fb-status" class="feedback-status"></div>
    </div>`;

  // Load saved settings (form URL + user name)
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (res?.data?.feedbackUserName) {
      document.getElementById('fb-name').value = res.data.feedbackUserName;
    }
    appState._feedbackFormUrl = res?.data?.feedbackFormUrl || '';
    if (!appState._feedbackFormUrl) {
      document.getElementById('fb-status').className = 'feedback-status error';
      document.getElementById('fb-status').textContent = 'Feedback URL not configured. Ask admin to set it in Settings.';
    }
  });

  // Version (from manifest)
  document.getElementById('fb-version').textContent = chrome.runtime.getManifest()?.version || '—';

  document.getElementById('feedback-back-btn')?.addEventListener('click', () => {
    transition(appState.prevPhase || STATE.IDLE);
  });

  document.getElementById('fb-submit-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('fb-status');
    const btn      = document.getElementById('fb-submit-btn');
    const name     = document.getElementById('fb-name').value.trim();
    const category = document.getElementById('fb-category').value;
    const severity = document.getElementById('fb-severity').value;
    const message  = document.getElementById('fb-message').value.trim();

    if (!message) {
      statusEl.className = 'feedback-status error';
      statusEl.textContent = 'Please describe what happened.';
      return;
    }
    if (!appState._feedbackFormUrl) {
      statusEl.className = 'feedback-status error';
      statusEl.textContent = 'Feedback URL not configured.';
      return;
    }

    // Persist user name for next time
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: { feedbackUserName: name } });

    btn.disabled = true;
    btn.textContent = 'Sending…';
    statusEl.className = 'feedback-status';
    statusEl.textContent = '';

    try {
      const includeCustomer = document.getElementById('fb-include-customer')?.checked;
      const version = chrome.runtime.getManifest()?.version || '';
      const structured =
        `Name: ${name}\nCategory: ${category}\nSeverity: ${severity}\nScreen: ${phaseLabel}\nVersion: ${version}` +
        (includeCustomer ? `\nCustomer: ${customerCtx}` : '') +
        `\n\n${message}`;

      // Google Forms prefill ONLY works with real numeric entry IDs
      // (entry.123456=...). The old code invented keys like "entry.name", so
      // forms opened blank while the panel claimed success and wiped the text.
      // Honest behavior: substitute {placeholders} when the admin provided
      // them; otherwise open the bare form and put everything on the clipboard.
      let url = appState._feedbackFormUrl;
      let prefilled = false;
      if (/entry\.\d+/.test(url) && url.includes('{')) {
        const placeholders = {
          '{name}': encodeURIComponent(name),
          '{category}': encodeURIComponent(category),
          '{severity}': encodeURIComponent(severity),
          '{message}': encodeURIComponent(message),
          '{phase}':    encodeURIComponent(phaseLabel),
          '{customer}': encodeURIComponent(includeCustomer ? customerCtx : ''),
          '{version}':  encodeURIComponent(version)
        };
        for (const [k, v] of Object.entries(placeholders)) url = url.split(k).join(v);
        prefilled = true;
      }

      try { await navigator.clipboard.writeText(structured); } catch (_) {}
      chrome.tabs.create({ url, active: true });

      statusEl.className = 'feedback-status success';
      statusEl.textContent = prefilled
        ? '✓ Form opened pre-filled — review and click Submit there. (Also copied to clipboard.)'
        : '✓ Form opened. Your feedback is on the clipboard — paste it into the form, then Submit. Your text stays here until you leave this screen.';
      // Deliberately NOT clearing the textarea — losing pilot feedback silently
      // was the bug this replaces.
    } catch (err) {
      statusEl.className = 'feedback-status error';
      statusEl.textContent = '✕ ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Feedback';
    }
  });
}

function renderError() {
  const canRetryAnalysis = appState.researchData && appState.odooData;
  contentEl.innerHTML = `
    <div class="screen">
      <div class="error-banner">
        <span>${esc(appState.error || 'An unexpected error occurred.')}</span>
        <button class="error-banner-dismiss" title="Dismiss">✕</button>
      </div>
      ${canRetryAnalysis ? `<button class="btn btn-primary btn-full btn-sm" id="retry-analysis-err-btn" style="margin-bottom:6px">↺ Retry Plan Generation</button>` : ''}
      <button class="btn btn-secondary btn-full btn-sm" id="restart-err-btn">↩ Start Over</button>
    </div>`;
  document.querySelector('.error-banner-dismiss')?.addEventListener('click', restart);
  document.getElementById('restart-err-btn')?.addEventListener('click', restart);
  document.getElementById('retry-analysis-err-btn')?.addEventListener('click', () => {
    // The worker supersedes/aborts any previous stream on START_ANALYSIS, so
    // retry can't double-stream into the panel anymore.
    transition(STATE.ANALYZING, { planText: '', error: null, analyzingStartMs: Date.now() });
    startSWKeepalive();
    chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      payload: { tabId: appState.currentTabId, odooData: appState.odooData, researchData: appState.researchData }
    });
  });
}

// ---- Helper renderers ----

function renderProfileChips(profile) {
  if (!profile) return '';
  const chips = [];
  if (profile.industry) chips.push(`<span class="chip chip-industry">${esc(profile.industry)}</span>`);
  if (profile.size) chips.push(`<span class="chip chip-size">${esc(profile.size)}</span>`);
  if (profile.fundingStage) chips.push(`<span class="chip chip-funding">${esc(profile.fundingStage)}</span>`);
  if (profile.expansionSignals?.length) chips.push(`<span class="chip chip-growth">↑ Growth signals</span>`);
  if (profile.riskSignals?.length) chips.push(`<span class="chip chip-risk">⚠ Risks</span>`);
  if (!chips.length) return '';
  return `<div class="profile-chips">${chips.join('')}</div>`;
}

function errorBanner() {
  if (!appState.error) return '';
  // No inline onclick — the side panel's CSP blocks inline handlers, so the
  // old dismiss button was dead. Renderers call bindErrorBanner() after paint.
  return `<div class="error-banner">
    <span>${esc(appState.error)}</span>
    <button class="error-banner-dismiss" title="Dismiss">✕</button>
  </div>`;
}

function bindErrorBanner() {
  document.querySelector('.error-banner-dismiss')?.addEventListener('click', () => {
    appState.error = null;
    render();
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<strong style="color:var(--primary)">$1</strong>')
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^\* (.+)$/gm, '• $1')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Actions ----

async function startResearch() {
  transition(STATE.RESEARCHING, { researchProgress: {} });
  ensureSWPort();
  startSWKeepalive(); // research is a long operation too — it was unprotected before
  chrome.runtime.sendMessage({
    type: 'START_RESEARCH',
    payload: { tabId: appState.currentTabId, customerName: appState.odooData.customerName, deepSearch: appState.deepSearch }
  });
}

function addBlankActivity() {
  const today = new Date();
  today.setDate(today.getDate() + 7);
  const dueDate = today.toISOString().split('T')[0];
  appState.activities.push({ activityType: 'Phone Call', summary: '', dueDate, notes: '' });
  transition(STATE.REVIEW);
}

async function createActivities() {
  const activities = appState.activities.filter(a => a.summary.trim());
  if (!activities.length) return;

  // Copy the full action plan to clipboard so the user can paste it wherever
  // needed (the Review screen discloses this next to the Create button)
  if (appState.planText) {
    try { await navigator.clipboard.writeText(appState.planText); } catch (_) {}
  }

  // Feedback indexes must follow the filtered list
  const feedback = {};
  let j = 0;
  appState.activities.forEach((a, i) => {
    if (!a.summary.trim()) return;
    if (appState.activityFeedback[i]) feedback[j] = appState.activityFeedback[i];
    j++;
  });

  transition(STATE.EXECUTING, { executionResults: [] });
  chrome.runtime.sendMessage({
    type: 'CREATE_ACTIVITIES',
    payload: { tabId: appState.currentTabId, activities, feedback }
  });
}

// ── Portfolio Scanner screens ─────────────────────────────────────────────────

function renderDashboard() {
  updatePhaseBar(null);
  contentEl.innerHTML = `
    <div class="portfolio-entry screen">
      <div class="portfolio-entry-icon">📊</div>
      <h2>Portfolio Scanner</h2>
      <p>You're on your CSM Dashboard.<br>Scan all your accounts at once — chatter, renewals, and open issues — to get an AI-prioritized action list.</p>
      <button class="btn btn-primary btn-full" id="scan-portfolio-btn">🔍 Scan Portfolio</button>
      <div id="last-portfolio-slot"></div>
      <p class="portfolio-hint">Analyzes chatter from all active subscriptions</p>
    </div>`;
  document.getElementById('scan-portfolio-btn')?.addEventListener('click', () => {
    transition(STATE.PORTFOLIO_SCANNING, { portfolioProgress: {}, portfolioText: '', portfolioCount: 0 });
    chrome.runtime.sendMessage({ type: 'SCAN_PORTFOLIO', payload: { tabId: appState.currentTabId } });
  });

  // A scan costs minutes of GPU time — offer the persisted last report
  chrome.runtime.sendMessage({ type: 'GET_PORTFOLIO_RESULT' }, (res) => {
    const saved = res?.data;
    if (!saved?.planText) return;
    const slot = document.getElementById('last-portfolio-slot');
    if (!slot) return;
    const when = new Date(saved.generatedAt).toLocaleString();
    slot.innerHTML = `<button class="btn btn-secondary btn-full btn-sm" id="open-last-portfolio">📄 View last report (${esc(when)})</button>`;
    document.getElementById('open-last-portfolio')?.addEventListener('click', () => {
      transition(STATE.PORTFOLIO_COMPLETE, {
        portfolioText: saved.planText,
        portfolioCount: saved.profileCount || 0,
        portfolioGeneratedAt: saved.generatedAt
      });
    });
  });
}

function renderPortfolioScanning() {
  updatePhaseBar(null);
  const steps = [
    { key: 'fetch_subs', label: 'Fetching subscriptions' },
    { key: 'fetch_msgs', label: 'Loading chatter history' },
    { key: 'analyze',    label: 'AI analysis' }
  ];
  const p = appState.portfolioProgress;
  const stepsHtml = steps.map(s => {
    const status = p[s.key] || 'pending';
    const icon = status === 'done' ? '✅' : status === 'running' ? '⏳' : '○';
    const label = p[`${s.key}_label`] || s.label;
    return `<div class="portfolio-step ${status}"><span class="step-icon">${icon}</span><span>${label}</span></div>`;
  }).join('');

  // Show streaming AI output if available
  const streamHtml = appState.portfolioText
    ? `<div class="portfolio-stream">${renderMarkdown(appState.portfolioText)}</div>`
    : '';

  contentEl.innerHTML = `
    <div class="portfolio-scanning screen">
      <h3>Scanning Portfolio…</h3>
      <div class="portfolio-steps">${stepsHtml}</div>
      ${streamHtml}
    </div>`;
}

function renderPortfolioComplete() {
  updatePhaseBar(null);
  const count = appState.portfolioCount;
  const when = appState.portfolioGeneratedAt ? new Date(appState.portfolioGeneratedAt).toLocaleString() : null;
  contentEl.innerHTML = `
    <div class="portfolio-complete screen">
      <div class="portfolio-complete-header">
        <span class="portfolio-count-badge">${count} accounts</span>
        <button class="btn btn-secondary btn-sm" id="portfolio-copy-btn">📋 Copy Report</button>
        <button class="btn btn-secondary btn-sm" id="portfolio-rescan-btn">↺ Rescan</button>
      </div>
      ${when ? `<div class="generated-at">Report generated ${esc(when)}</div>` : ''}
      <div class="portfolio-result markdown-body">${renderMarkdown(appState.portfolioText)}</div>
    </div>`;

  document.getElementById('portfolio-copy-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(appState.portfolioText);
      document.getElementById('portfolio-copy-btn').textContent = '✅ Copied';
    } catch (_) {}
  });
  document.getElementById('portfolio-rescan-btn')?.addEventListener('click', () => {
    transition(STATE.PORTFOLIO_SCANNING, { portfolioProgress: {}, portfolioText: '', portfolioCount: 0 });
    chrome.runtime.sendMessage({ type: 'SCAN_PORTFOLIO', payload: { tabId: appState.currentTabId } });
  });
}

function restart() {
  const { currentTabId, ollamaStatus } = appState;
  appState = { ...initialState, currentTabId, ollamaStatus };
  updatePhaseBar(null);
  render();
  if (currentTabId) triggerExtraction(currentTabId);
}

function showNavBanner() {
  const existing = document.getElementById('nav-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'nav-banner';
  banner.className = 'nav-banner';
  banner.innerHTML = `New subscription detected &nbsp;<button id="nav-refresh-btn">Refresh now</button>`;
  contentEl.prepend(banner);
  document.getElementById('nav-refresh-btn')?.addEventListener('click', () => {
    const { currentTabId, ollamaStatus } = appState;
    appState = { ...initialState, currentTabId, ollamaStatus };
    updatePhaseBar(null);
    triggerExtraction(currentTabId);
  });
}

// ---- Background message handler ----
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'PAGE_DATA_RESULT':
      if (msg.success && msg.data) {
        transition(STATE.EXTRACTED, { odooData: msg.data, error: null });
      } else {
        transition(STATE.ERROR, { error: msg.error || 'Failed to read page data' });
      }
      break;

    case 'RESEARCH_PROGRESS': {
      const p = { ...appState.researchProgress };
      p[msg.payload.step] = msg.payload.status;
      if (msg.payload.count !== undefined) p[`${msg.payload.step}_count`] = msg.payload.count;
      if (msg.payload.counts !== undefined) p[`${msg.payload.step}_counts`] = msg.payload.counts;
      appState.researchProgress = p;
      if (appState.phase === STATE.RESEARCHING) renderResearching();
      break;
    }

    case 'RESEARCH_COMPLETE':
      appState.researchData = msg.payload.researchData;
      // Auto-advance to analysis
      chrome.runtime.sendMessage({
        type: 'START_ANALYSIS',
        payload: { tabId: appState.currentTabId, odooData: appState.odooData, researchData: appState.researchData }
      });
      transition(STATE.ANALYZING, { planText: '', companyProfile: null, analyzingStartMs: Date.now(), analyzeModel: null });
      startSWKeepalive();
      break;

    case 'ANALYSIS_MODEL':
      appState.analyzeModel = msg.payload;
      if (appState.phase === STATE.ANALYZING) {
        const el = document.getElementById('model-indicator');
        if (el) el.innerHTML = modelIndicatorHtml();
      }
      break;

    case 'DRAFT_PROGRESS':
      if (appState.drafts[msg.payload.index]) {
        appState.drafts[msg.payload.index] = { loading: true, text: msg.payload.accumulated || appState.drafts[msg.payload.index].text || '' };
        if (appState.phase === STATE.REVIEW) refreshDraftBox(msg.payload.index);
      }
      break;

    case 'DRAFT_COMPLETE':
      appState.drafts[msg.payload.index] = msg.payload.success
        ? { loading: false, text: msg.payload.text }
        : { loading: false, error: msg.payload.error };
      if (appState.phase === STATE.REVIEW) refreshDraftBox(msg.payload.index);
      break;

    case 'ANALYSIS_PROGRESS':
      if (msg.payload.step === 'profile' && msg.payload.companyProfile) {
        appState.companyProfile = msg.payload.companyProfile;
        if (appState.phase === STATE.ANALYZING) renderAnalyzing(); // chips appear — full repaint once
      }
      if (msg.payload.accumulated !== undefined) {
        appState.planText = msg.payload.accumulated;
        updateStreamingPlan(); // scoped — only the plan box repaints
      }
      break;

    case 'ANALYSIS_COMPLETE':
      if (appState.phase !== STATE.ANALYZING) break; // user already advanced via Continue button
      if (msg.payload.success) {
        transition(STATE.REVIEW, {
          companyProfile: msg.payload.companyProfile,
          planText: msg.payload.planText,
          activities: msg.payload.activities,
          referenceChecks: msg.payload.referenceChecks || [],
          coverage: msg.payload.coverage || null,
          generatedAt: msg.payload.generatedAt || Date.now(),
          error: null
        });
      } else {
        transition(STATE.ERROR, {
          error: msg.payload.error || 'Plan generation failed — unknown error',
          companyProfile: msg.payload.companyProfile
        });
      }
      break;

    case 'ACTIVITY_PROGRESS':
      appState.executionResults.push(msg.payload);
      if (appState.phase === STATE.EXECUTING) renderExecuting();
      break;

    case 'ACTIVITY_COMPLETE':
      transition(STATE.COMPLETE, {
        executionResults: msg.payload.results?.length ? msg.payload.results : appState.executionResults,
        activityError: msg.payload.error || null
      });
      break;

    case 'PAGE_DATA_ENRICHED':
      if (appState.odooData) {
        if (msg.payload.dbInfo && !msg.payload.dbInfo.error) {
          appState.odooData.dbInfo = msg.payload.dbInfo;
          if (msg.payload.dbInfo.installedModules?.length) {
            appState.odooData.installedModules = msg.payload.dbInfo.installedModules;
          }
        }
        appState.enrichmentError = msg.payload.error || null;
        if (appState.phase === STATE.EXTRACTED) renderExtracted();
      }
      break;

    case 'QUICK_BRIEF_PROGRESS':
      appState.quickBriefLoading = true;
      if (appState.phase === STATE.EXTRACTED) renderExtracted();
      break;

    case 'QUICK_BRIEF_COMPLETE':
      appState.quickBriefLoading = false;
      if (msg.payload.success) {
        appState.quickBrief = msg.payload.brief;
        appState.projectInfo = msg.payload.projectInfo || null;
        appState.quickBriefError = null;
      } else {
        appState.quickBrief = null;
        appState.quickBriefError = msg.payload.error || 'Failed';
      }
      if (appState.phase === STATE.EXTRACTED) renderExtracted();
      break;

    case 'PORTFOLIO_PROGRESS': {
      const p = { ...appState.portfolioProgress };
      p[msg.payload.step] = msg.payload.status;
      if (msg.payload.label) p[`${msg.payload.step}_label`] = msg.payload.label;
      appState.portfolioProgress = p;
      if (msg.payload.count) appState.portfolioCount = msg.payload.count;
      if (msg.payload.accumulated) appState.portfolioText = msg.payload.accumulated;
      if (appState.phase === STATE.PORTFOLIO_SCANNING) renderPortfolioScanning();
      break;
    }

    case 'PORTFOLIO_COMPLETE':
      if (msg.payload.success) {
        transition(STATE.PORTFOLIO_COMPLETE, {
          portfolioText: msg.payload.planText,
          portfolioCount: msg.payload.profileCount || appState.portfolioCount,
          portfolioGeneratedAt: msg.payload.generatedAt || Date.now()
        });
      } else {
        transition(STATE.ERROR, { error: msg.payload.error || 'Portfolio scan failed' });
      }
      break;

    case 'PAGE_NAVIGATED':
      if (msg.payload.tabId !== appState.currentTabId) break;
      // Landing on the dashboard
      if (msg.payload.isDashboard) {
        appState = { ...initialState, currentTabId: appState.currentTabId, ollamaStatus: appState.ollamaStatus };
        transition(STATE.DASHBOARD);
        break;
      }
      if ([STATE.IDLE, STATE.EXTRACTED, STATE.COMPLETE, STATE.ERROR, STATE.DASHBOARD,
           STATE.PORTFOLIO_COMPLETE].includes(appState.phase)) {
        // Safe to auto-refresh immediately
        const { currentTabId, ollamaStatus } = appState;
        appState = { ...initialState, currentTabId, ollamaStatus };
        updatePhaseBar(null);
        triggerExtraction(currentTabId);
      } else {
        // Mid-flow — show a non-blocking banner so user can choose when to refresh
        appState.navPending = true;
        showNavBanner();
      }
      break;
  }
});

// ---- Settings button ----
document.getElementById('settings-btn')?.addEventListener('click', () => {
  if (appState.phase !== STATE.SETTINGS) {
    appState.prevPhase = appState.phase;
    transition(STATE.SETTINGS);
  }
});

// ---- Feedback button ----
document.getElementById('feedback-btn')?.addEventListener('click', () => {
  if (appState.phase !== STATE.FEEDBACK) {
    appState.prevPhase = appState.phase;
    transition(STATE.FEEDBACK);
  }
});

// ---- Init ----
async function triggerExtraction(tabId) {
  transition(STATE.EXTRACTING);
  const result = await new Promise(r =>
    chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_DATA', payload: { tabId } }, r)
  );
  if (result?.success && result.data) {
    transition(STATE.EXTRACTED, { odooData: result.data, error: null });
  } else {
    transition(STATE.IDLE, { error: result?.error });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load persisted deep search setting + configured server URL (for honest error text)
  chrome.storage.sync.get(['deepSearch', 'ollamaUrl'], (r) => {
    appState.deepSearch = !!r.deepSearch;
    appState.ollamaUrl = r.ollamaUrl || 'http://10.100.255.200:11434';
  });

  // Background Ollama health check
  chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA' }, (res) => {
    appState.ollamaStatus = res?.data?.available ?? false;
    if (appState.phase === STATE.IDLE) render();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { transition(STATE.IDLE); return; }

  appState.currentTabId = tab.id;

  const isOdoo = /odoo\.com|localhost|127\.0\.0\.1/.test(tab.url || '');
  const isDashboard = /action-1592|\/board\//.test(tab.url || '');
  const isSalesOrder = /sale\.order|\/sales\/|\/subscriptions\/|#.*model=sale/.test(tab.url || '');

  // Try to restore saved session
  const savedSession = await new Promise(r =>
    chrome.runtime.sendMessage({ type: 'GET_SESSION', payload: { tabId: tab.id } }, r)
  );

  if (savedSession?.data?.activities?.length || savedSession?.data?.partialPlanText) {
    const s = savedSession.data;
    // Validate the session belongs to the current URL before restoring
    // (prevents showing previous subscription's plan after in-tab navigation)
    let urlMatch = false;
    try {
      const savedPath = s.odooData?.pageUrl ? new URL(s.odooData.pageUrl).pathname.replace(/\/$/, '') : '';
      const currentPath = tab.url ? new URL(tab.url).pathname.replace(/\/$/, '') : '';
      urlMatch = savedPath && currentPath && savedPath === currentPath;
    } catch { /* bad URL — don't restore */ }

    if (urlMatch && s.activities?.length) {
      transition(STATE.REVIEW, {
        odooData: s.odooData,
        researchData: s.researchData,
        companyProfile: s.companyProfile,
        planText: s.planText,
        activities: s.activities,
        referenceChecks: s.referenceChecks || [],
        coverage: s.coverage || null,
        generatedAt: s.generatedAt || null,   // the banner marks stale plans — they used to look fresh
        memoryKey: s.memoryKey || null
      });
      return;
    }
    if (urlMatch && s.partialPlanText) {
      // The worker persists streamed text every ~3s — a plan interrupted by a
      // closed panel is recoverable instead of silently discarded
      transition(STATE.REVIEW, {
        odooData: s.odooData,
        researchData: s.researchData,
        companyProfile: s.companyProfile,
        planText: s.partialPlanText,
        activities: parseActivitiesFromPlan(s.partialPlanText),
        generatedAt: s.partialPlanAt || null,
        error: 'Recovered a partially generated plan (the panel was closed mid-generation). Review carefully or Start Over to regenerate.'
      });
      return;
    }
    // URL mismatch — stale session from a different subscription, fall through to re-extract
  }

  if (isOdoo && isDashboard) {
    transition(STATE.DASHBOARD);
  } else if (isOdoo && isSalesOrder) {
    triggerExtraction(tab.id);
  } else {
    transition(STATE.IDLE);
  }
});

// ── Reschedule screen ────────────────────────────────────────────────────────
// Bulk-writes due dates in Odoo, so it is preview-first: a dry run shows
// exactly which activities move where, and nothing is written until the user
// confirms that list. (The old version wrote immediately, with copy that
// claimed "Call activities" while actually moving every type.)

let _rescheduleOpts = null;
let _reschedulePlan = null;  // concrete {date, ids}[] captured from the preview

function rescheduleBack() {
  // Re-render the real app state — the old innerHTML-snapshot restore brought
  // back dead markup with no event listeners
  updatePhaseBar(PHASE_MAP[appState.phase] ?? null);
  render();
}

function renderRescheduleScreen(state = 'idle') {
  const content = document.getElementById('content');

  if (state === 'loading') {
    content.innerHTML = `
      <div class="reschedule-screen screen">
        <div class="loading-screen">
          <div class="loading-row">
            <div class="loading-icon"><div class="spinner"></div></div>
            <span class="loading-label active">Working…</span>
          </div>
        </div>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="reschedule-screen screen">
      <div class="reschedule-hero">
        <h2>Reschedule Overdue Activities</h2>
        <p>Finds your overdue activities and distributes them into upcoming weekdays, starting tomorrow. Nothing is changed until you confirm the preview.</p>
      </div>
      <div class="reschedule-config">
        <div class="reschedule-config-row">
          <strong>Max per day:</strong>
          <input id="max-per-day-input" type="number" min="1" max="100" value="18" class="reschedule-number-input">
        </div>
        <div><strong>Starts:</strong> Tomorrow (weekdays only)</div>
        <div class="reschedule-config-row">
          <strong>Types:</strong>
          <select id="types-select" class="reschedule-select">
            <option value="calls">Call activities only</option>
            <option value="all">All activity types</option>
          </select>
        </div>
        <div class="reschedule-config-row">
          <strong>Scope:</strong>
          <select id="scope-select" class="reschedule-select">
            <option value="include_today">Overdue + Today</option>
            <option value="overdue_only">Overdue only</option>
          </select>
        </div>
      </div>
      <button id="run-reschedule-btn" class="btn btn-primary" style="width:100%">Preview Reschedule</button>
      <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px">Back</button>
    </div>`;

  document.getElementById('run-reschedule-btn').addEventListener('click', () => runReschedule(true));
  document.getElementById('reschedule-back-btn').addEventListener('click', rescheduleBack);
}

function renderReschedulePreview(result) {
  const content = document.getElementById('content');
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const days = (result.preview || []).map(day => `
    <div class="reschedule-day">
      <div class="reschedule-day-head">${esc(fmt(day.date))} — ${day.activities.length} activit${day.activities.length === 1 ? 'y' : 'ies'}</div>
      ${day.activities.slice(0, 30).map(a =>
        `<div class="reschedule-day-row">• [${esc(a.type)}] ${esc(a.summary)}${a.record ? ` — ${esc(a.record)}` : ''} <span class="muted">(was ${esc(a.from)})</span></div>`
      ).join('')}
    </div>`).join('');

  content.innerHTML = `
    <div class="reschedule-screen screen">
      <div class="reschedule-hero">
        <h2>Preview — nothing changed yet</h2>
        <p><strong>${result.count}</strong> activit${result.count === 1 ? 'y' : 'ies'} will move across <strong>${result.days}</strong> day${result.days > 1 ? 's' : ''}:</p>
      </div>
      <div class="reschedule-preview">${days}</div>
      <button id="confirm-reschedule-btn" class="btn btn-success" style="width:100%">✓ Confirm — move ${result.count} activit${result.count === 1 ? 'y' : 'ies'}</button>
      <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px">Cancel</button>
    </div>`;

  // Capture the EXACT plan the user is approving so confirm applies it verbatim
  // (not a freshly recomputed one)
  _reschedulePlan = result.plan || null;
  document.getElementById('confirm-reschedule-btn').addEventListener('click', () => runReschedule(false));
  document.getElementById('reschedule-back-btn').addEventListener('click', () => renderRescheduleScreen('idle'));
}

function renderRescheduleResult(result) {
  const content = document.getElementById('content');
  if (result.count === 0) {
    content.innerHTML = `
      <div class="reschedule-screen screen">
        <div class="reschedule-empty">✓ No overdue activities matching the filter — you're all caught up!</div>
        <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px;margin-top:8px">Back</button>
      </div>`;
  } else {
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateRange = result.days === 1
      ? fmt(result.firstDate)
      : `${fmt(result.firstDate)} – ${fmt(result.lastDate)}`;
    content.innerHTML = `
      <div class="reschedule-screen screen">
        <div class="reschedule-result">
          <div class="result-count">${result.count}</div>
          <div class="result-label">activities rescheduled</div>
          <div class="result-detail">Across ${result.days} day${result.days > 1 ? 's' : ''}: ${dateRange}</div>
          ${result.skipped ? `<div class="result-detail muted">${result.skipped} skipped — changed in Odoo since the preview</div>` : ''}
        </div>
        <button id="reschedule-again-btn" class="btn btn-primary" style="width:100%">Run Again</button>
        <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px">Back</button>
      </div>`;
    document.getElementById('reschedule-again-btn').addEventListener('click', () => renderRescheduleScreen('idle'));
  }
  document.getElementById('reschedule-back-btn').addEventListener('click', rescheduleBack);
}

function renderRescheduleError(message) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="reschedule-screen screen">
      <div class="reschedule-error"><strong>Error:</strong> ${esc(message)}</div>
      <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px;margin-top:12px">Back</button>
    </div>`;
  document.getElementById('reschedule-back-btn').addEventListener('click', () => renderRescheduleScreen('idle'));
}

async function runReschedule(dryRun) {
  if (dryRun) {
    _rescheduleOpts = {
      maxPerDay: Math.max(1, parseInt(document.getElementById('max-per-day-input')?.value) || 18),
      includeToday: document.getElementById('scope-select')?.value !== 'overdue_only',
      callsOnly: document.getElementById('types-select')?.value !== 'all'
    };
  }
  const opts = _rescheduleOpts || { maxPerDay: 18, includeToday: true, callsOnly: true };
  renderRescheduleScreen('loading');

  let baseUrl;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) throw new Error('No active tab found');
    baseUrl = new URL(tab.url).origin;
  } catch (err) {
    renderRescheduleError('Cannot determine Odoo URL: ' + err.message);
    return;
  }

  // Confirm applies the exact previewed plan (verbatim); dry run computes a fresh one
  const confirmPlan = !dryRun ? _reschedulePlan : null;
  chrome.runtime.sendMessage(
    { type: 'RESCHEDULE_ACTIVITIES', payload: { baseUrl, ...opts, dryRun, confirmPlan } },
    (response) => {
      if (chrome.runtime.lastError) { renderRescheduleError(chrome.runtime.lastError.message); return; }
      if (!response.success) { renderRescheduleError(response.error); return; }
      if (response.data.count === 0) { renderRescheduleResult(response.data); return; }
      if (dryRun) renderReschedulePreview(response.data);
      else renderRescheduleResult(response.data);
    }
  );
}

document.getElementById('logo').addEventListener('dblclick', () => {
  renderRescheduleScreen('idle');
});
