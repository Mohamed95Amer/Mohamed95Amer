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
  analyzingStartMs: null
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
  });
  phaseConnectors.forEach((c, i) => {
    c.classList.toggle('done', i < current);
  });
}

// ---- Transitions ----
function transition(newPhase, updates = {}) {
  appState = { ...appState, ...updates, phase: newPhase };
  const phaseName = PHASE_MAP[newPhase];
  if (phaseName) updatePhaseBar(phaseName);
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
    ? `<div class="warning-banner">Local Ollama server unreachable (10.100.255.200) — <a href="#" id="setup-link">open Settings</a></div>`
    : '';
  contentEl.innerHTML = `
    <div class="idle-screen screen">
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
      <div class="deep-search-row">
        <label class="toggle-label" for="deep-search-toggle">
          <input type="checkbox" id="deep-search-toggle" ${appState.deepSearch ? 'checked' : ''}>
          <span>Deep Search</span>
        </label>
        <span class="toggle-hint">Loads full chatter history (slower)</span>
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

function parseActivitiesLocal(planText) {
  const activities = [];
  const chunks = (planText || '').split(/(?=###\s+Activity\s+\d+)/i).filter(c => /###\s+Activity\s+\d+/i.test(c));
  for (const chunk of chunks) {
    const h = chunk.match(/###\s+Activity\s+\d+[:\s*]*\*{0,2}(Phone\s*Call|Email|Meeting)\*{0,2}\s*[—–\-]+\s*(.+)/i);
    if (!h) continue;
    const activityType = /phone/i.test(h[1]) ? 'Phone Call' : /email/i.test(h[1]) ? 'Email' : 'Meeting';
    const summary = h[2].replace(/\*+/g, '').trim().slice(0, 60);
    const dueMatch = chunk.match(/\*{0,2}Due(?:\s*[Dd]ate)?\*{0,2}:\s*([^\n]+)/i);
    const rawDate = dueMatch?.[1]?.trim() || '';
    // Ensure ISO format (YYYY-MM-DD) — fall back to +3/7/14 days from today
    const isoMatch = rawDate.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const dueDate = isoMatch
      ? `${isoMatch[1]}-${String(+isoMatch[2]).padStart(2,'0')}-${String(+isoMatch[3]).padStart(2,'0')}`
      : (() => { const d = new Date(); d.setDate(d.getDate() + ([3,7,14][activities.length] ?? 7)); return d.toISOString().split('T')[0]; })();
    const notesMatch = chunk.match(/\*{0,2}Notes?\*{0,2}:\s*([\s\S]+)/i);
    const notes = notesMatch ? notesMatch[1].trim() : '';
    activities.push({ activityType, summary, dueDate, notes });
  }
  return activities;
}

function renderAnalyzing() {
  const profileSection = appState.companyProfile
    ? renderProfileChips(appState.companyProfile)
    : '';

  const planComplete = appState.planText.includes('## Recommended Activities') &&
    appState.planText.split('### Activity').length >= 4;

  const elapsedMs = appState.analyzingStartMs ? Date.now() - appState.analyzingStartMs : 0;
  const isStalled = elapsedMs > 120000 && !appState.planText?.trim();

  // Schedule a re-render at the 2-minute mark to surface the retry button
  if (appState.analyzingStartMs && elapsedMs < 120000 && !appState.planText?.trim()) {
    const msUntilRetry = 120000 - elapsedMs + 500;
    clearTimeout(appState._stalledTimer);
    appState._stalledTimer = setTimeout(() => {
      if (appState.phase === STATE.ANALYZING && !appState.planText?.trim()) renderAnalyzing();
    }, msUntilRetry);
  }

  contentEl.innerHTML = `
    <div class="screen">
      ${profileSection}
      <div class="summary-section">
        <div class="label">Action Plan</div>
        <div class="plan-box ${planComplete ? '' : 'cursor-blink'}" id="streaming-plan">
          ${renderMarkdown(appState.planText || (isStalled ? 'No response yet — the model may be slow or overloaded.' : 'Generating plan…'))}
        </div>
      </div>
      ${planComplete ? `<button class="btn btn-primary btn-full" id="plan-continue-btn">Continue to Review →</button>` : ''}
      ${isStalled ? `<button class="btn btn-secondary btn-full" id="retry-analysis-btn" style="margin-top:8px">↺ Retry plan generation</button>` : ''}
    </div>`;

  document.getElementById('plan-continue-btn')?.addEventListener('click', () => {
    transition(STATE.REVIEW, {
      planText: appState.planText,
      activities: parseActivitiesLocal(appState.planText),
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
}

function renderReview() {
  const profileSection = appState.companyProfile
    ? renderProfileChips(appState.companyProfile)
    : '';

  const activityCards = appState.activities.map((act, i) => renderActivityCard(act, i)).join('');

  contentEl.innerHTML = `
    <div class="screen">
      ${errorBanner()}
      ${profileSection}
      <div class="summary-section">
        <div class="label">Plan Summary</div>
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
        <button class="btn btn-secondary btn-full btn-sm" id="restart-btn">↩ Start Over</button>
      </div>
    </div>`;

  document.getElementById('add-activity-btn')?.addEventListener('click', addBlankActivity);
  document.getElementById('create-activities-btn')?.addEventListener('click', createActivities);
  document.getElementById('restart-btn')?.addEventListener('click', restart);
  bindActivityCardEvents();
}

function renderActivityCard(act, index) {
  const badgeClass = act.activityType === 'Phone Call' ? 'badge-call' :
                     act.activityType === 'Email' ? 'badge-email' : 'badge-meeting';
  return `
    <div class="activity-card" data-index="${index}">
      <div class="activity-card-header">
        <span class="activity-type-badge ${badgeClass}">${esc(act.activityType)}</span>
        <div class="activity-card-actions">
          <button class="btn-icon danger remove-activity" data-index="${index}" title="Remove">✕</button>
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
      <div class="activity-notes" data-index="${index}" title="Click to expand notes">
        📝 ${esc((act.notes || '').slice(0, 120))}${act.notes?.length > 120 ? '…' : ''}
      </div>
    </div>`;
}

function bindActivityCardEvents() {
  document.querySelectorAll('.remove-activity').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.index);
      appState.activities.splice(i, 1);
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

  const failedDetails = appState.executionResults
    .filter(r => !r?.success)
    .map(r => `<li>${r.summary}: ${r.error || 'unknown error'}</li>`)
    .join('');

  contentEl.innerHTML = `
    <div class="complete-screen screen">
      <div class="complete-icon">${sysError ? '⚠️' : failed === 0 ? '🎉' : '⚠️'}</div>
      <h2>${succeeded} of ${total} ${total === 1 ? 'activity' : 'activities'} created</h2>
      ${sysError ? `<p style="color:var(--danger);font-size:12px">Error: ${sysError}</p>` : ''}
      ${failedDetails ? `<ul style="color:var(--danger);font-size:11px;text-align:left">${failedDetails}</ul>` : ''}
      ${!sysError && failed === 0 ? '<p>Activities are now visible in the Odoo chatter.</p>' : ''}
      <button class="btn btn-primary btn-sm" id="restart-complete-btn">↩ Start New Analysis</button>
    </div>`;
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

      <div id="settings-saved" class="settings-saved" style="display:none">✓ Saved</div>
    </div>`;

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

  document.getElementById('test-llm-btn')?.addEventListener('click', () => {
    const statusEl = document.getElementById('llm-status');
    statusEl.textContent = 'Testing…';
    const payload = {
      ollamaUrl:       document.getElementById('ollama-url').value.trim(),
      ollamaModel:     document.getElementById('ollama-model-smart').value.trim(),
      ollamaModelFast: document.getElementById('ollama-model-fast').value.trim()
    };
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload }, () => {
      chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA' }, (res) => {
        if (res?.data?.available) {
          const models = res.data.models || [];
          const onServer = (name) => !models.length || models.some(m => m === name || m.startsWith(name + ':'));
          const lines = [];
          for (const [label, name] of [['Smart', payload.ollamaModel], ['Fast', payload.ollamaModelFast]]) {
            lines.push(onServer(name)
              ? `<span style="color:var(--success)">✓ ${label}: ${esc(name)}</span>`
              : `<span style="color:var(--warning)">⚠ ${label}: "${esc(name)}" not on server</span>`);
          }
          if (lines.some(l => l.includes('⚠'))) {
            lines.push(`<span style="color:var(--text-muted)">Available: ${esc(models.slice(0, 6).join(', '))}</span>`);
          }
          statusEl.innerHTML = lines.join('<br>');
          appState.ollamaStatus = true;
        } else {
          statusEl.innerHTML = `<span style="color:var(--danger)">✕ Could not reach server</span> — check the URL and that the Ollama service is running`;
          appState.ollamaStatus = false;
        }
      });
    });
  });

  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    const payload = {
      ollamaUrl:       document.getElementById('ollama-url').value.trim(),
      ollamaModel:     document.getElementById('ollama-model-smart').value.trim(),
      ollamaModelFast: document.getElementById('ollama-model-fast').value.trim(),
      deepSearch:      appState.deepSearch,
      feedbackFormUrl: document.getElementById('feedback-url').value.trim()
    };
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload }, () => {
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
        <div class="label">Auto-attached context</div>
        Screen: <strong>${esc(phaseLabel)}</strong><br>
        Customer: <strong>${esc(customerCtx)}</strong><br>
        Version: <strong id="fb-version">…</strong>
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
      // Build a pre-filled Google Form URL.
      // The admin pastes the form's /viewform URL into Settings; we open it pre-filled
      // and the user clicks Submit on Google's page (avoids needing entry.XXX field IDs).
      const params = new URLSearchParams({
        'usp': 'pp_url',
        'entry.name':     name,
        'entry.category': category,
        'entry.severity': severity,
        'entry.message':  message,
        'entry.phase':    phaseLabel,
        'entry.customer': customerCtx,
        'entry.version':  chrome.runtime.getManifest()?.version || ''
      });
      // If the admin URL has explicit entry.XXX field IDs we just use those.
      // Otherwise we open a generic prefill — user submits manually.
      let url = appState._feedbackFormUrl;
      if (url.includes('entry.')) {
        // URL already has entry mappings — substitute placeholders
        const placeholders = {
          '{name}': encodeURIComponent(name),
          '{category}': encodeURIComponent(category),
          '{severity}': encodeURIComponent(severity),
          '{message}': encodeURIComponent(message),
          '{phase}':    encodeURIComponent(phaseLabel),
          '{customer}': encodeURIComponent(customerCtx),
          '{version}':  encodeURIComponent(chrome.runtime.getManifest()?.version || '')
        };
        for (const [k, v] of Object.entries(placeholders)) url = url.split(k).join(v);
      } else {
        url = url.replace(/\/viewform.*$/, '/viewform') + '?' + params.toString();
      }
      chrome.tabs.create({ url, active: true });

      statusEl.className = 'feedback-status success';
      statusEl.textContent = '✓ Form opened in a new tab — review and click Submit there.';
      document.getElementById('fb-message').value = '';
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
  const canRetryAnalysis = appState.researchData && appState.odooData &&
    (appState.error || '').toLowerCase().includes('restart');
  contentEl.innerHTML = `
    <div class="screen">
      <div class="error-banner">
        <span>${esc(appState.error || 'An unexpected error occurred.')}</span>
        <button onclick="restart()">✕</button>
      </div>
      ${canRetryAnalysis ? `<button class="btn btn-primary btn-full btn-sm" id="retry-analysis-err-btn" style="margin-bottom:6px">↺ Retry Plan Generation</button>` : ''}
      <button class="btn btn-secondary btn-full btn-sm" id="restart-err-btn">↩ Start Over</button>
    </div>`;
  document.getElementById('restart-err-btn')?.addEventListener('click', restart);
  document.getElementById('retry-analysis-err-btn')?.addEventListener('click', () => {
    appState.analyzingStartMs = Date.now();
    appState.planText = '';
    appState.error = null;
    transition(STATE.ANALYZING, { planText: '', analyzingStartMs: Date.now() });
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
  return `<div class="error-banner">
    <span>${esc(appState.error)}</span>
    <button onclick="appState.error=null;render()">✕</button>
  </div>`;
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

  // Copy the full action plan to clipboard so the user can paste it wherever needed
  if (appState.planText) {
    try { await navigator.clipboard.writeText(appState.planText); } catch (_) {}
  }

  transition(STATE.EXECUTING, { executionResults: [] });
  chrome.runtime.sendMessage({
    type: 'CREATE_ACTIVITIES',
    payload: { tabId: appState.currentTabId, activities }
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
      <p class="portfolio-hint">Analyzes chatter from all active subscriptions</p>
    </div>`;
  document.getElementById('scan-portfolio-btn')?.addEventListener('click', () => {
    transition(STATE.PORTFOLIO_SCANNING, { portfolioProgress: {}, portfolioText: '', portfolioCount: 0 });
    chrome.runtime.sendMessage({ type: 'SCAN_PORTFOLIO', payload: { tabId: appState.currentTabId } });
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
  contentEl.innerHTML = `
    <div class="portfolio-complete screen">
      <div class="portfolio-complete-header">
        <span class="portfolio-count-badge">${count} accounts</span>
        <button class="btn btn-secondary btn-sm" id="portfolio-copy-btn">📋 Copy Report</button>
        <button class="btn btn-secondary btn-sm" id="portfolio-rescan-btn">↺ Rescan</button>
      </div>
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
      transition(STATE.ANALYZING, { planText: '', companyProfile: null, analyzingStartMs: Date.now() });
      startSWKeepalive();
      break;

    case 'ANALYSIS_PROGRESS':
      if (msg.payload.step === 'profile' && msg.payload.companyProfile) {
        appState.companyProfile = msg.payload.companyProfile;
      }
      if (msg.payload.accumulated !== undefined) {
        appState.planText = msg.payload.accumulated;
      }
      if (appState.phase === STATE.ANALYZING) renderAnalyzing();
      break;

    case 'ANALYSIS_COMPLETE':
      if (appState.phase !== STATE.ANALYZING) break; // user already advanced via Continue button
      if (msg.payload.success) {
        transition(STATE.REVIEW, {
          companyProfile: msg.payload.companyProfile,
          planText: msg.payload.planText,
          activities: msg.payload.activities,
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
          portfolioCount: msg.payload.profileCount || appState.portfolioCount
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
  // Load persisted deep search setting
  chrome.storage.sync.get(['deepSearch'], (r) => { appState.deepSearch = !!r.deepSearch; });

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

  if (savedSession?.data?.activities?.length) {
    const s = savedSession.data;
    // Validate the session belongs to the current URL before restoring
    // (prevents showing previous subscription's plan after in-tab navigation)
    let urlMatch = false;
    try {
      const savedPath = s.odooData?.pageUrl ? new URL(s.odooData.pageUrl).pathname.replace(/\/$/, '') : '';
      const currentPath = tab.url ? new URL(tab.url).pathname.replace(/\/$/, '') : '';
      urlMatch = savedPath && currentPath && savedPath === currentPath;
    } catch { /* bad URL — don't restore */ }

    if (urlMatch) {
      transition(STATE.REVIEW, {
        odooData: s.odooData,
        researchData: s.researchData,
        companyProfile: s.companyProfile,
        planText: s.planText,
        activities: s.activities
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

let _rescheduleBackFn = null;

function renderRescheduleScreen(state = 'idle') {
  const content = document.getElementById('content');

  if (state === 'loading') {
    content.innerHTML = `
      <div class="reschedule-screen screen">
        <div class="loading-screen">
          <div class="loading-row">
            <div class="loading-icon"><div class="spinner"></div></div>
            <span class="loading-label active">Rescheduling activities...</span>
          </div>
        </div>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="reschedule-screen screen">
      <div class="reschedule-hero">
        <h2>Reschedule Overdue Activities</h2>
        <p>Finds all overdue Call activities and distributes them into upcoming weekdays, starting tomorrow.</p>
      </div>
      <div class="reschedule-config">
        <div class="reschedule-config-row">
          <strong>Max per day:</strong>
          <input id="max-per-day-input" type="number" min="1" max="100" value="18" class="reschedule-number-input">
        </div>
        <div><strong>Starts:</strong> Tomorrow (weekdays only)</div>
        <div class="reschedule-config-row">
          <strong>Scope:</strong>
          <select id="scope-select" class="reschedule-select">
            <option value="include_today">Overdue + Today</option>
            <option value="overdue_only">Overdue only</option>
          </select>
        </div>
      </div>
      <button id="run-reschedule-btn" class="btn btn-primary" style="width:100%">Reschedule Now</button>
      <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px">Back</button>
    </div>`;

  document.getElementById('run-reschedule-btn').addEventListener('click', runReschedule);
  document.getElementById('reschedule-back-btn').addEventListener('click', () => _rescheduleBackFn?.());
}

function renderRescheduleResult(result) {
  const content = document.getElementById('content');
  if (result.count === 0) {
    content.innerHTML = `
      <div class="reschedule-screen screen">
        <div class="reschedule-empty">✓ No overdue activities — you're all caught up!</div>
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
        </div>
        <button id="reschedule-again-btn" class="btn btn-primary" style="width:100%">Run Again</button>
        <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px">Back</button>
      </div>`;
    document.getElementById('reschedule-again-btn').addEventListener('click', runReschedule);
  }
  document.getElementById('reschedule-back-btn').addEventListener('click', () => _rescheduleBackFn?.());
}

function renderRescheduleError(message) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="reschedule-screen screen">
      <div class="reschedule-error"><strong>Error:</strong> ${message}</div>
      <button id="reschedule-back-btn" class="btn btn-secondary" style="width:100%;font-size:12px;margin-top:12px">Back</button>
    </div>`;
  document.getElementById('reschedule-back-btn').addEventListener('click', () => renderRescheduleScreen('idle'));
}

async function runReschedule() {
  const maxPerDay = Math.max(1, parseInt(document.getElementById('max-per-day-input')?.value) || 18);
  const includeToday = document.getElementById('scope-select')?.value !== 'overdue_only';
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

  chrome.runtime.sendMessage(
    { type: 'RESCHEDULE_ACTIVITIES', payload: { baseUrl, maxPerDay, includeToday } },
    (response) => {
      if (chrome.runtime.lastError) { renderRescheduleError(chrome.runtime.lastError.message); return; }
      if (!response.success) { renderRescheduleError(response.error); return; }
      renderRescheduleResult(response.data);
    }
  );
}

document.getElementById('logo').addEventListener('dblclick', () => {
  const content = document.getElementById('content');
  const snapshot = content.innerHTML;
  _rescheduleBackFn = () => { content.innerHTML = snapshot; };
  renderRescheduleScreen('idle');
});
