// ── State ────────────────────────────────────────────────────────────────────
const STATE = {
  IDLE:         'idle',
  EXTRACTING:   'extracting',
  EXTRACTED:    'extracted',
  LOADING:      'loading',
  ANALYZING:    'analyzing',
  COMPLETE:     'complete',
  EMAIL_INPUT:  'email_input',
  EMAIL_DRAFT:  'email_draft',
  SETTINGS:     'settings',
  ERROR:        'error'
};

const initialState = {
  phase: STATE.IDLE,
  currentTabId: null,
  odooData: null,
  planText: '',
  steps: [],
  loadingProgress: {},
  geminiStatus: null,
  error: null,
  prevPhase: null,
  activeTab: 'plan',
  emailText: '',
  emailStreaming: false,
};

let appState = { ...initialState };

// ── DOM ──────────────────────────────────────────────────────────────────────
const contentEl = document.getElementById('content');

// ── Transition ───────────────────────────────────────────────────────────────
function transition(newPhase, updates = {}) {
  appState = { ...appState, ...updates, phase: newPhase };
  render();
}

// ── Render dispatcher ────────────────────────────────────────────────────────
function render() {
  contentEl.innerHTML = '';
  switch (appState.phase) {
    case STATE.IDLE:        renderIdle();        break;
    case STATE.EXTRACTING:  renderExtracting();  break;
    case STATE.EXTRACTED:   renderExtracted();   break;
    case STATE.LOADING:     renderLoading();     break;
    case STATE.ANALYZING:   renderAnalyzing();   break;
    case STATE.COMPLETE:    renderComplete();    break;
    case STATE.EMAIL_INPUT: renderEmailInput();  break;
    case STATE.EMAIL_DRAFT: renderEmailDraft();  break;
    case STATE.SETTINGS:    renderSettings();    break;
    case STATE.ERROR:       renderError();       break;
  }
}

// ── Screens ──────────────────────────────────────────────────────────────────

function renderIdle() {
  const warn = appState.geminiStatus === false
    ? `<div class="warning-banner">Gemini API key not configured — <a href="#" id="setup-link">open Settings</a></div>`
    : '';
  contentEl.innerHTML = `
    <div class="idle-screen">
      ${warn}
      <div class="idle-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          <path d="M13 13l6 6"/>
        </svg>
      </div>
      <h2>Churn Recovery Copilot</h2>
      <p>Open a churned or cancelled subscription page in Odoo to get started.</p>
      <button class="btn btn-secondary btn-sm" style="width:auto" id="open-settings-idle">⚙ Settings</button>
    </div>`;
  document.getElementById('open-settings-idle')?.addEventListener('click', () => transition(STATE.SETTINGS, { prevPhase: STATE.IDLE }));
  document.getElementById('setup-link')?.addEventListener('click', (e) => { e.preventDefault(); transition(STATE.SETTINGS, { prevPhase: STATE.IDLE }); });
}

function renderExtracting() {
  contentEl.innerHTML = `
    <div class="loading-screen">
      <div class="loading-row">
        <div class="loading-icon"><div class="spinner"></div></div>
        <span class="loading-label active">Reading subscription page…</span>
      </div>
    </div>`;
}

function renderExtracted() {
  const d = appState.odooData;
  contentEl.innerHTML = `
    <div class="customer-card">
      <div class="customer-name">${esc(d.customerName || 'Unknown Customer')}</div>
      <div class="meta-row">
        ${d.soNumber        ? `<span class="badge">${esc(d.soNumber)}</span>` : ''}
        ${d.subscriptionState ? `<span class="badge badge-churn">⚠ ${esc(d.subscriptionState)}</span>` : ''}
        ${d.recurringAmount  ? `<span class="badge badge-amount">${esc(d.recurringAmount)} ${esc(d.currency || '')}</span>` : ''}
        ${d.subscriptionPlan ? `<span class="badge">${esc(d.subscriptionPlan)}</span>` : ''}
      </div>
    </div>

    <div class="overview-section">
      ${d.endDate            ? `<div class="overview-row"><span class="overview-label">End Date</span><span>${esc(d.endDate)}</span></div>` : ''}
      ${d.hosting            ? `<div class="overview-row"><span class="overview-label">Hosting</span><span>${esc(d.hosting)}</span></div>` : ''}
      ${d.assignedSalesperson? `<div class="overview-row"><span class="overview-label">Salesperson</span><span>${esc(d.assignedSalesperson)}</span></div>` : ''}
      ${d.chatHistory?.length? `<div class="overview-row"><span class="overview-label">Chatter (initial)</span><span>${d.chatHistory.length} messages visible</span></div>` : ''}
      ${d.products?.length   ? `<div class="overview-row"><span class="overview-label">Products</span><span>${d.products.map(p => esc(p.name)).join(', ')}</span></div>` : ''}
    </div>

    <button class="btn btn-primary" id="analyze-btn">
      🔍 Analyze Churn &amp; Build Recovery Plan
    </button>`;

  document.getElementById('analyze-btn')?.addEventListener('click', startAnalysis);
}

function renderLoading() {
  const p = appState.loadingProgress;
  const steps = [
    { key: 'chatter', label: 'Loading full chatter history' },
    { key: 'sales',   label: 'Loading previous subscription history' },
    { key: 'ai',      label: 'AI analyzing churn signals' }
  ];

  const rows = steps.map(s => {
    const status = p[s.key] || 'pending';
    let icon;
    if      (status === 'running') icon = `<div class="spinner"></div>`;
    else if (status === 'done')    icon = `<span class="check-icon">✓</span>`;
    else if (status === 'error')   icon = `<span style="color:var(--warning)">—</span>`;
    else                           icon = `<div class="pending-dot"></div>`;

    const isActive = status === 'running';
    const count = p[`${s.key}_count`];
    const detail = count != null ? ` (${count})` : '';
    return `<div class="loading-row">
      <div class="loading-icon">${icon}</div>
      <span class="loading-label ${isActive ? 'active' : ''}">${esc(s.label)}${detail}</span>
    </div>`;
  }).join('');

  contentEl.innerHTML = `<div class="loading-screen">${rows}</div>`;
}

function renderAnalyzing() {
  const p = appState.loadingProgress;
  const steps = [
    { key: 'chatter', label: 'Loading full chatter history' },
    { key: 'sales',   label: 'Loading previous subscription history' },
    { key: 'ai',      label: 'AI analyzing churn signals' }
  ];
  const rows = steps.map(s => {
    const status = p[s.key] || 'pending';
    let icon;
    if      (status === 'running') icon = `<div class="spinner"></div>`;
    else if (status === 'done')    icon = `<span class="check-icon">✓</span>`;
    else                           icon = `<div class="pending-dot"></div>`;
    const count = p[`${s.key}_count`];
    const detail = count != null ? ` (${count})` : '';
    return `<div class="loading-row">
      <div class="loading-icon">${icon}</div>
      <span class="loading-label ${status === 'running' ? 'active' : ''}">${esc(s.label)}${detail}</span>
    </div>`;
  }).join('');

  const isCursorVisible = !appState.planText.includes('## Recovery Pitch Script') || appState.planText.length < 300;

  contentEl.innerHTML = `
    <div class="loading-screen">${rows}</div>
    ${appState.planText ? `
    <div>
      <div class="streaming-label" style="margin-bottom:6px">Generating…</div>
      <div class="plan-box ${isCursorVisible ? 'cursor-blink' : ''}" id="stream-box">
        ${renderMarkdown(appState.planText)}
      </div>
    </div>` : ''}`;
}

function renderComplete() {
  const d = appState.odooData;

  // Extract category + recovery potential from plan text
  const categoryMatch  = appState.planText.match(/\*\*Churn Category:\*\*\s*([^\n]+)/i);
  const potentialMatch = appState.planText.match(/\*\*Recovery Potential:\*\*\s*([^\n]+)/i);
  const category  = categoryMatch?.[1]?.trim()  || '';
  const potential = potentialMatch?.[1]?.trim() || '';

  const potCls = /high/i.test(potential) ? 'recovery-high'
    : /medium/i.test(potential) ? 'recovery-medium'
    : potential ? 'recovery-low' : '';

  // Split plan into diagnosis+plan section vs pitch section
  const pitchIdx = appState.planText.indexOf('## Recovery Pitch Script');
  const planPart  = pitchIdx > -1 ? appState.planText.slice(0, pitchIdx).trim() : appState.planText;
  const pitchPart = pitchIdx > -1 ? appState.planText.slice(pitchIdx).trim() : '';

  const activeTab = appState.activeTab || 'plan';

  contentEl.innerHTML = `
    <div class="complete-header">
      <div class="customer-name" style="font-size:14px">${esc(d?.customerName || '')}</div>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${category  ? `<span class="churn-category">⚠ ${esc(category)}</span>` : ''}
      ${potential ? `<span class="recovery-pill ${potCls}">↑ ${esc(potential)} Recovery</span>` : ''}
    </div>

    <div class="tab-bar">
      <button class="tab-btn ${activeTab === 'plan'  ? 'active' : ''}" id="tab-plan">📋 Recovery Plan</button>
      <button class="tab-btn ${activeTab === 'pitch' ? 'active' : ''}" id="tab-pitch">💬 Pitch Script</button>
      <button class="tab-btn ${activeTab === 'steps' ? 'active' : ''}" id="tab-steps">✅ Steps (${appState.steps.length})</button>
    </div>

    <div id="tab-content">
      ${activeTab === 'plan'  ? renderPlanTab(planPart) : ''}
      ${activeTab === 'pitch' ? renderPitchTab(pitchPart) : ''}
      ${activeTab === 'steps' ? renderStepsTab() : ''}
    </div>

    <button class="btn btn-email" id="draft-email-btn">✉ Draft Recovery Email</button>
    <button class="btn btn-secondary btn-sm" id="restart-btn">↩ Start New Analysis</button>`;

  document.getElementById('tab-plan')?.addEventListener('click', () => {
    appState.activeTab = 'plan'; render();
  });
  document.getElementById('tab-pitch')?.addEventListener('click', () => {
    appState.activeTab = 'pitch'; render();
  });
  document.getElementById('tab-steps')?.addEventListener('click', () => {
    appState.activeTab = 'steps'; render();
  });
  document.getElementById('draft-email-btn')?.addEventListener('click', () => {
    transition(STATE.EMAIL_INPUT, { prevPhase: STATE.COMPLETE, emailText: '' });
  });
  document.getElementById('restart-btn')?.addEventListener('click', restart);
  document.getElementById('copy-plan-btn')?.addEventListener('click', () => copyText(planPart, 'copy-plan-btn'));
  document.getElementById('copy-pitch-btn')?.addEventListener('click', () => copyText(pitchPart, 'copy-pitch-btn'));
  document.getElementById('copy-all-btn')?.addEventListener('click', () => copyText(appState.planText, 'copy-all-btn'));
}

function renderPlanTab(planPart) {
  return `
    <div class="result-section">
      <div class="section-header">
        <span class="section-title">Churn Diagnosis &amp; Recovery Plan</span>
        <button class="btn-copy" id="copy-plan-btn">Copy</button>
      </div>
      <div class="result-card plan-card">${renderMarkdown(planPart)}</div>
    </div>`;
}

function renderPitchTab(pitchPart) {
  if (!pitchPart) {
    return `<div class="result-card" style="color:var(--text-muted);text-align:center;padding:30px">No pitch script generated.</div>`;
  }
  return `
    <div class="result-section">
      <div class="section-header">
        <span class="section-title">Recovery Pitch Script</span>
        <button class="btn-copy" id="copy-pitch-btn">Copy</button>
      </div>
      <div class="result-card pitch-card">${renderMarkdown(pitchPart)}</div>
    </div>`;
}

function renderStepsTab() {
  if (!appState.steps.length) {
    return `<div class="result-card" style="color:var(--text-muted);text-align:center;padding:30px">No action steps parsed.</div>`;
  }
  const cards = appState.steps.map((s, i) => {
    const badgeCls = /phone/i.test(s.activityType) ? 'badge-call'
      : /email/i.test(s.activityType) ? 'badge-email' : 'badge-meeting';
    return `
      <div class="step-card">
        <div class="step-header">
          <span class="step-type-badge ${badgeCls}">${esc(s.activityType)}</span>
          <span class="step-summary">${esc(s.summary)}</span>
          <span class="step-due">Due ${esc(s.dueDate)}</span>
        </div>
        ${s.notes ? `<div class="step-notes">${renderMarkdown(s.notes)}</div>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="result-section">
      <div class="section-header">
        <span class="section-title">${appState.steps.length} Recovery Steps</span>
        <button class="btn-copy" id="copy-all-btn">Copy All</button>
      </div>
      <div class="steps-section">${cards}</div>
    </div>`;
}

function renderEmailInput() {
  const d = appState.odooData;
  const name = (d?.customerName || '').split(/[\s,]+/)[0] || d?.customerName || 'the client';

  contentEl.innerHTML = `
    <div class="email-input-screen">
      <div class="email-input-header">
        <button class="settings-back" id="email-back-btn">← Back to Analysis</button>
        <h2>Draft Recovery Email</h2>
        <p class="email-input-sub">For <strong>${esc(d?.customerName || 'this client')}</strong> — tell me what happened and I'll write the email.</p>
      </div>

      <div class="scenario-hints">
        <div class="scenario-hint-label">Quick select (or write your own below):</div>
        <div class="scenario-chips" id="scenario-chips">
          <button class="scenario-chip" data-note="Called them, no answer. Left no voicemail.">📞 No answer</button>
          <button class="scenario-chip" data-note="Called, left a voicemail. No callback so far.">📱 Voicemail left</button>
          <button class="scenario-chip" data-note="Emailed 1 week ago, no reply.">📧 Email ignored</button>
          <button class="scenario-chip" data-note="Spoke briefly on the phone. They said they are tight on budget right now but didn't say no.">💬 Spoke — budget concern</button>
          <button class="scenario-chip" data-note="They replied to my email and said they are currently evaluating other options.">🔄 Evaluating competitors</button>
          <button class="scenario-chip" data-note="Had a full conversation. They are open to coming back but want to see a better deal or a different plan.">🤝 Open to return</button>
        </div>
      </div>

      <div class="form-group">
        <label>What happened? (the more detail the better)</label>
        <textarea id="interaction-note" class="email-textarea"
          placeholder="e.g., 'Called ${esc(name)} twice, no answer both times. Account has been inactive since January and their 100+ hours of project data is at risk of deletion in 2 weeks.'

Or: 'They replied to my email. Said the main reason they left was the price, and they felt support was slow. They are open to a call next week.'"
          rows="6">${appState._emailNote || ''}</textarea>
        <span class="form-hint">This tells me the scenario so I write the right type of email — urgency, follow-up, or nudge.</span>
      </div>

      <button class="btn btn-primary" id="generate-email-btn">✉ Generate Email</button>
    </div>`;

  document.getElementById('email-back-btn')?.addEventListener('click', () => {
    transition(STATE.COMPLETE);
  });

  // Scenario chip click → fill textarea
  document.getElementById('scenario-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.scenario-chip');
    if (!chip) return;
    const ta = document.getElementById('interaction-note');
    if (ta) ta.value = chip.dataset.note;
    document.querySelectorAll('.scenario-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });

  document.getElementById('generate-email-btn')?.addEventListener('click', () => {
    const note = document.getElementById('interaction-note')?.value?.trim();
    if (!note) {
      document.getElementById('interaction-note')?.focus();
      return;
    }
    appState._emailNote = note;
    transition(STATE.EMAIL_DRAFT, { emailText: '', emailStreaming: true });
    chrome.runtime.sendMessage({
      type: 'DRAFT_EMAIL',
      payload: { tabId: appState.currentTabId, userNote: note }
    });
  });
}

function renderEmailDraft() {
  // Parse subject from emailText
  const raw = appState.emailText || '';
  const subjectMatch = raw.match(/^SUBJECT:\s*(.+)/im);
  const subject    = subjectMatch?.[1]?.trim() || '';
  const bodyStart  = subjectMatch ? raw.indexOf('\n', raw.indexOf(subjectMatch[0])) : 0;
  const body       = bodyStart > 0 ? raw.slice(bodyStart).trim() : (subjectMatch ? '' : raw);
  const isStreaming = appState.emailStreaming;

  if (isStreaming && !raw) {
    contentEl.innerHTML = `
      <div class="loading-screen" style="padding:20px 0">
        <div class="loading-row">
          <div class="loading-icon"><div class="spinner"></div></div>
          <span class="loading-label active">Writing email for ${esc(appState.odooData?.customerName || 'client')}…</span>
        </div>
      </div>`;
    return;
  }

  contentEl.innerHTML = `
    <div class="email-result-screen">
      <div class="email-result-header">
        <button class="settings-back" id="email-result-back-btn">← Edit Note</button>
        <span class="section-title">Generated Email</span>
      </div>

      ${subject ? `
      <div class="email-subject-block">
        <div class="email-subject-label">Subject</div>
        <div class="email-subject-text" id="email-subject">${esc(subject)}</div>
        <button class="btn-copy" id="copy-subject-btn">Copy subject</button>
      </div>` : ''}

      <div class="email-body-block ${isStreaming ? 'cursor-blink' : ''}">
        <div class="email-body-label">
          <span>Body</span>
          <button class="btn-copy" id="copy-body-btn">Copy body</button>
        </div>
        <div class="email-body-text" id="email-body">${esc(body)}</div>
      </div>

      ${!isStreaming ? `
      <div class="email-actions">
        <button class="btn btn-primary" id="copy-full-email-btn">📋 Copy Full Email</button>
        <button class="btn btn-secondary btn-sm" id="regenerate-btn">↺ Edit &amp; Regenerate</button>
        <button class="btn btn-secondary btn-sm" id="back-to-analysis-btn">← Back to Analysis</button>
      </div>` : ''}
    </div>`;

  document.getElementById('email-result-back-btn')?.addEventListener('click', () => {
    transition(STATE.EMAIL_INPUT);
  });
  document.getElementById('copy-subject-btn')?.addEventListener('click', () => copyText(subject, 'copy-subject-btn'));
  document.getElementById('copy-body-btn')?.addEventListener('click', () => copyText(body, 'copy-body-btn'));
  document.getElementById('copy-full-email-btn')?.addEventListener('click', () => {
    const full = subject ? `Subject: ${subject}\n\n${body}` : body;
    copyText(full, 'copy-full-email-btn');
  });
  document.getElementById('regenerate-btn')?.addEventListener('click', () => {
    transition(STATE.EMAIL_INPUT);
  });
  document.getElementById('back-to-analysis-btn')?.addEventListener('click', () => {
    transition(STATE.COMPLETE);
  });
}

function renderSettings() {
  contentEl.innerHTML = `
    <div class="settings-screen">
      <button class="settings-back" id="settings-back-btn">← Back</button>
      <h2>Gemini AI Settings</h2>

      <div class="settings-box">
        <strong>Get your free API key</strong><br>
        <ol>
          <li>Go to <strong>aistudio.google.com/apikey</strong></li>
          <li>Sign in → click "Create API Key"</li>
          <li>Paste it below — ~1M tokens/min free</li>
        </ol>
      </div>

      <div class="form-group">
        <label>Gemini API Key</label>
        <input type="password" id="gemini-key" placeholder="AIza…" autocomplete="off">
        <span class="form-hint">Stored on this device only (chrome.storage.local) — it does not sync to your other devices.</span>
      </div>

      <div class="form-group consent-box">
        <label class="consent-label">
          <input type="checkbox" id="ai-consent">
          <span>I understand that running an analysis or drafting an email sends the subscription record — including chatter and internal CSM notes — to Google Gemini for processing. Do not enable this for data you are not permitted to share with a third-party AI provider.</span>
        </label>
      </div>

      <div class="form-group">
        <label>Model</label>
        <select id="gemini-model">
          <option value="gemini-2.5-flash">gemini-2.5-flash — best speed + quality (default)</option>
          <option value="gemini-2.5-flash-lite-preview-06-17">gemini-2.5-flash-lite — fastest</option>
          <option value="gemini-flash-latest">gemini-flash-latest — always latest Flash</option>
        </select>
      </div>

      <div class="form-group">
        <label>Email Signature</label>
        <textarea id="email-sig" class="email-textarea" rows="5"
          placeholder="Mostafa Hassan | Customer Strategist&#10;Direct Number: +971 52 601 4697&#10;Book a meeting: [Calendar link]&#10;Dubai, United Arab Emirates"></textarea>
        <span class="form-hint">Appended to every drafted email exactly as written.</span>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="test-btn">Test Connection</button>
        <button class="btn btn-primary btn-sm" id="save-btn">Save</button>
      </div>

      <div id="gemini-status" style="font-size:12px;min-height:18px"></div>
      <div id="settings-saved" class="settings-saved" style="display:none">✓ Saved</div>
    </div>`;

  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (res?.data) {
      if (res.data.geminiApiKey)   document.getElementById('gemini-key').value  = res.data.geminiApiKey;
      if (res.data.geminiModel)    document.getElementById('gemini-model').value = res.data.geminiModel;
      if (res.data.emailSignature) document.getElementById('email-sig').value    = res.data.emailSignature;
      const consentEl = document.getElementById('ai-consent');
      if (consentEl) consentEl.checked = res.data.aiConsent === true;
    }
  });

  document.getElementById('settings-back-btn')?.addEventListener('click', () => {
    transition(appState.prevPhase || STATE.IDLE);
  });

  document.getElementById('test-btn')?.addEventListener('click', () => {
    const statusEl = document.getElementById('gemini-status');
    statusEl.textContent = 'Testing…';
    const geminiApiKey   = document.getElementById('gemini-key').value.trim();
    const geminiModel    = document.getElementById('gemini-model').value;
    const emailSignature = document.getElementById('email-sig').value;
    const aiConsent      = document.getElementById('ai-consent').checked;
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: { geminiApiKey, geminiModel, emailSignature, aiConsent } }, () => {
      chrome.runtime.sendMessage({ type: 'CHECK_GEMINI' }, (res) => {
        if (res?.data?.available) {
          statusEl.innerHTML = `<span style="color:var(--success)">✓ Gemini connected — ${esc(geminiModel)}</span>`;
          appState.geminiStatus = true;
        } else {
          statusEl.innerHTML = `<span style="color:var(--danger)">✕ Connection failed — check your API key</span>`;
          appState.geminiStatus = false;
        }
      });
    });
  });

  document.getElementById('save-btn')?.addEventListener('click', () => {
    const geminiApiKey   = document.getElementById('gemini-key').value.trim();
    const geminiModel    = document.getElementById('gemini-model').value;
    const emailSignature = document.getElementById('email-sig').value;
    const aiConsent      = document.getElementById('ai-consent').checked;
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: { geminiApiKey, geminiModel, emailSignature, aiConsent } }, () => {
      const el = document.getElementById('settings-saved');
      if (el) { el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 2000); }
    });
  });
}

function renderError() {
  contentEl.innerHTML = `
    <div class="error-banner">
      <span>${esc(appState.error || 'An unexpected error occurred.')}</span>
    </div>
    <button class="btn btn-secondary" id="restart-err-btn">↩ Start Over</button>`;
  document.getElementById('restart-err-btn')?.addEventListener('click', restart);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<span class="md-h2">$1</span>')
    .replace(/^### (.+)$/gm, '<span class="md-h3">$1</span>')
    .replace(/^\*\* (.+)$/gm, '• <strong>$1</strong>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/^\* (.+)$/gm, '• $1')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

async function copyText(text, btnId) {
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById(btnId);
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = orig, 2000); }
  } catch {}
}

function restart() {
  const { currentTabId, geminiStatus } = appState;
  appState = { ...initialState, currentTabId, geminiStatus };
  render();
  if (currentTabId) triggerExtraction(currentTabId);
}

// ── Actions ──────────────────────────────────────────────────────────────────

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

function startAnalysis() {
  transition(STATE.LOADING, { loadingProgress: {}, planText: '', steps: [] });
  chrome.runtime.sendMessage({ type: 'START_ANALYSIS', payload: { tabId: appState.currentTabId } });
}

// ── Background message handler ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'ANALYSIS_PROGRESS': {
      const p = { ...appState.loadingProgress };
      p[msg.payload.step] = msg.payload.status;
      if (msg.payload.count !== undefined) p[`${msg.payload.step}_count`] = msg.payload.count;

      if (msg.payload.accumulated !== undefined) {
        // Streaming AI text — switch to ANALYZING view
        appState = { ...appState, loadingProgress: p, planText: msg.payload.accumulated, phase: STATE.ANALYZING };
        render();
      } else {
        appState.loadingProgress = p;
        if (appState.phase === STATE.LOADING || appState.phase === STATE.ANALYZING) render();
      }
      break;
    }

    case 'ANALYSIS_COMPLETE':
      if (msg.payload.success) {
        transition(STATE.COMPLETE, {
          planText: msg.payload.planText,
          steps: msg.payload.steps || [],
          error: null,
          activeTab: 'plan'
        });
      } else {
        transition(STATE.ERROR, { error: msg.payload.error || 'Analysis failed — unknown error' });
      }
      break;

    case 'EMAIL_DRAFT_PROGRESS':
      appState.emailText = msg.payload.accumulated || '';
      appState.emailStreaming = true;
      if (appState.phase === STATE.EMAIL_DRAFT) render();
      break;

    case 'EMAIL_DRAFT_COMPLETE':
      if (msg.payload.success) {
        appState.emailText = msg.payload.emailText || '';
        appState.emailStreaming = false;
        if (appState.phase === STATE.EMAIL_DRAFT) render();
      } else {
        transition(STATE.ERROR, { error: msg.payload.error || 'Email generation failed' });
      }
      break;

    case 'PAGE_NAVIGATED':
      if (msg.payload.tabId !== appState.currentTabId) break;
      // Never auto-reset — show a banner so the user can load the new record manually.
      showNewRecordBanner();
      break;
  }
});

// ── New record banner ─────────────────────────────────────────────────────────
function showNewRecordBanner() {
  // Don't stack banners
  if (document.getElementById('new-record-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'new-record-banner';
  banner.className = 'new-record-banner';
  banner.innerHTML = `
    <span>New record detected</span>
    <button id="load-new-record-btn">Load it →</button>
    <button id="dismiss-banner-btn">✕</button>`;
  // Prepend above the content area
  document.body.insertBefore(banner, document.getElementById('content'));

  document.getElementById('load-new-record-btn')?.addEventListener('click', () => {
    banner.remove();
    const { currentTabId, geminiStatus } = appState;
    appState = { ...initialState, currentTabId, geminiStatus };
    triggerExtraction(currentTabId);
  });
  document.getElementById('dismiss-banner-btn')?.addEventListener('click', () => {
    banner.remove();
  });
}

// ── Settings button ───────────────────────────────────────────────────────────
document.getElementById('settings-btn')?.addEventListener('click', () => {
  if (appState.phase !== STATE.SETTINGS) {
    transition(STATE.SETTINGS, { prevPhase: appState.phase });
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Check Gemini in background
  chrome.runtime.sendMessage({ type: 'CHECK_GEMINI' }, (res) => {
    appState.geminiStatus = res?.data?.available ?? false;
    if (appState.phase === STATE.IDLE) render();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { transition(STATE.IDLE); return; }

  appState.currentTabId = tab.id;

  const isOdoo = /odoo\.com|localhost|127\.0\.0\.1/.test(tab.url || '');
  const isSO   = /sale\.order|\/sales\/|\/subscriptions\/|[#&]model=sale/.test(tab.url || '');

  // Try to restore saved session
  const savedSession = await new Promise(r =>
    chrome.runtime.sendMessage({ type: 'GET_SESSION', payload: { tabId: tab.id } }, r)
  );

  if (savedSession?.data?.planText) {
    const s = savedSession.data;
    transition(STATE.COMPLETE, {
      odooData: s.odooData,
      planText: s.planText,
      steps: s.steps || [],
      activeTab: 'plan'
    });
    return;
  }

  if (isOdoo && isSO) {
    triggerExtraction(tab.id);
  } else {
    transition(STATE.IDLE);
  }
});
