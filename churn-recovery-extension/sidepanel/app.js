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
  LEARNINGS:    'learnings',
  STORY_INPUT:  'story_input',
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
  learningsApplied: 0,
  learnings: [],
  playbook: [],
  playbookApplied: 0,
  learnTab: 'rules',
  teachStatus: '',
  _rating: null,
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
    case STATE.LEARNINGS:   renderLearnings();   break;
    case STATE.STORY_INPUT: renderStoryInput();  break;
    case STATE.ERROR:       renderError();       break;
  }
}

// ── Screens ──────────────────────────────────────────────────────────────────

function renderIdle() {
  const warn = appState.geminiStatus === false
    ? `<div class="warning-banner">AI API key not configured — <a href="#" id="setup-link">open Settings</a></div>`
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
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" style="width:auto" id="open-settings-idle">⚙ Settings</button>
        <button class="btn btn-secondary btn-sm" style="width:auto" id="open-learnings-idle">🎓 Learning Center</button>
      </div>
    </div>`;
  document.getElementById('open-settings-idle')?.addEventListener('click', () => transition(STATE.SETTINGS, { prevPhase: STATE.IDLE }));
  document.getElementById('open-learnings-idle')?.addEventListener('click', openLearnings);
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

    ${renderTeachPanel(category, potential)}

    <button class="btn btn-email" id="draft-email-btn">✉ Draft Recovery Email</button>
    <button class="btn btn-secondary btn-sm" id="restart-btn">↩ Start New Analysis</button>`;

  wireTeachPanel({ category, potential });

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

// ── Teach & Correct panel (the learning loop) ─────────────────────────────────
function renderTeachPanel(category, potential) {
  const rules = appState.learningsApplied || 0;
  const plays = appState.playbookApplied || 0;
  const counts = (rules || plays)
    ? [rules ? `${rules} rule${rules > 1 ? 's' : ''}` : '', plays ? `${plays} play${plays > 1 ? 's' : ''}` : '']
        .filter(Boolean).join(' · ') + ' applied'
    : 'Learning Center';
  const rating  = appState._rating;
  const status  = appState.teachStatus || '';
  return `
    <div class="teach-panel">
      <div class="teach-header">
        <span class="teach-title">🎓 Teach &amp; Correct</span>
        <span class="learn-count" id="view-learnings">${counts}</span>
      </div>
      <div class="rating-row">
        <span class="rating-q">Was this accurate?</span>
        <button class="rate-btn ${rating === 'up'   ? 'active' : ''}" data-rate="up"   title="Accurate">👍</button>
        <button class="rate-btn ${rating === 'down' ? 'active' : ''}" data-rate="down" title="Off the mark">👎</button>
      </div>
      <textarea id="correction-input" class="teach-textarea" rows="3"
        placeholder="What should change? e.g. 'The real reason was price, not slow support' or 'Be less formal and keep the pitch shorter'">${esc(appState._correctionDraft || '')}</textarea>
      <div class="teach-actions">
        <button class="btn btn-secondary btn-sm" id="regenerate-analysis-btn" title="Re-run on this account with your fix">↻ Correct &amp; Regenerate</button>
        <button class="btn btn-primary btn-sm" id="save-learning-btn" title="Remember this for future accounts">💾 Save as Learning</button>
      </div>
      <button class="btn btn-story btn-sm" id="save-story-btn" title="This account was won back — capture the winning steps as a playbook case">🏆 Save Success Story</button>
      ${status ? `<div class="teach-status ${status.startsWith('✓') ? 'ok' : ''}">${esc(status)}</div>` : ''}
      <div class="teach-hint">Regenerate fixes <em>this</em> account now. Save as Learning improves <em>every future</em> account. Success Stories become proven plays the AI reuses.</div>
    </div>`;
}

function wireTeachPanel(ctx) {
  const ta = () => document.getElementById('correction-input');
  const account = () => appState.odooData?.customerName || appState.odooData?.soNumber || '';

  document.querySelectorAll('.rate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.rate;
      appState._rating = appState._rating === r ? null : r;
      chrome.runtime.sendMessage({
        type: 'SUBMIT_FEEDBACK',
        payload: { rating: appState._rating, text: ta()?.value?.trim() || '', saveAsLearning: false, account: account(), context: ctx }
      });
      document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.dataset.rate === appState._rating));
    });
  });

  document.getElementById('view-learnings')?.addEventListener('click', openLearnings);

  document.getElementById('save-story-btn')?.addEventListener('click', () => {
    // Pre-fill the story form from the current analysis.
    appState._storyDraft = {
      accountName: account(),
      churnCategory: (ctx.category || '').replace(/^\W+/, '').trim(),
      situation: '', actions: '', outcome: ''
    };
    transition(STATE.STORY_INPUT, { prevPhase: STATE.COMPLETE });
  });

  ta()?.addEventListener('input', (e) => { appState._correctionDraft = e.target.value; });

  document.getElementById('regenerate-analysis-btn')?.addEventListener('click', () => {
    const text = ta()?.value?.trim();
    if (!text) { ta()?.focus(); return; }
    appState._correctionDraft = '';
    appState.loadingProgress = { chatter: 'done', sales: 'done' };
    transition(STATE.LOADING, { planText: '', steps: [], teachStatus: '' });
    chrome.runtime.sendMessage({ type: 'REGENERATE_ANALYSIS', payload: { tabId: appState.currentTabId, correction: text } });
  });

  document.getElementById('save-learning-btn')?.addEventListener('click', () => {
    const text = ta()?.value?.trim();
    if (!text) { ta()?.focus(); return; }
    const btn = document.getElementById('save-learning-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    chrome.runtime.sendMessage({
      type: 'SUBMIT_FEEDBACK',
      payload: { rating: appState._rating, text, saveAsLearning: true, account: account(), context: ctx }
    }, (res) => {
      if (res?.success) {
        appState.learnings = res.learnings || [];
        appState.learningsApplied = (res.learnings || []).length;
        appState._correctionDraft = '';
        appState.teachStatus = '✓ Learned — future analyses will apply this.';
      } else {
        appState.teachStatus = 'Could not save — try again.';
      }
      if (appState.phase === STATE.COMPLETE) render();
    });
  });
}

function openLearnings() {
  const from = appState.phase;
  chrome.runtime.sendMessage({ type: 'GET_LEARNINGS' }, (res) => {
    appState.learnings = res?.data || [];
    appState.learningsApplied = (res?.data || []).length;
    chrome.runtime.sendMessage({ type: 'GET_PLAYBOOK' }, (res2) => {
      appState.playbook = res2?.data || [];
      appState.playbookApplied = (res2?.data || []).length;
      transition(STATE.LEARNINGS, { prevPhase: from });
    });
  });
}

function renderLearnings() {
  const rules = appState.learnings || [];
  const plays = appState.playbook || [];
  const tab = appState.learnTab || 'rules';

  const ruleItems = rules.length
    ? rules.map(l => `
        <div class="learn-card">
          <div class="learn-text">${esc(l.text)}</div>
          <div class="learn-meta">
            <span>${esc(l.sourceAccount || 'manual')}${l.createdAt ? ' · ' + esc(String(l.createdAt).slice(0, 10)) : ''}</span>
            <button class="learn-del" data-kind="rule" data-id="${esc(l.id)}" title="Forget this rule">✕</button>
          </div>
        </div>`).join('')
    : `<div class="result-card" style="color:var(--text-muted);text-align:center;padding:24px">
         No rules yet.<br>Correct an analysis and hit "Save as Learning".
       </div>`;

  const playItems = plays.length
    ? plays.map(s => `
        <div class="learn-card play-card">
          <div class="play-head">
            <span class="badge badge-churn">${esc(s.churnCategory || 'Unknown')}</span>
            <strong class="play-account">${esc(s.accountName || 'Unnamed account')}</strong>
          </div>
          ${s.situation ? `<div class="play-row"><span class="play-label">Situation</span>${esc(s.situation)}</div>` : ''}
          ${s.actions   ? `<div class="play-row"><span class="play-label">What worked</span>${esc(s.actions)}</div>` : ''}
          ${s.outcome   ? `<div class="play-row"><span class="play-label">Outcome</span>${esc(s.outcome)}</div>` : ''}
          ${s.keyLesson ? `<div class="play-lesson">💡 ${esc(s.keyLesson)}</div>` : ''}
          <div class="learn-meta">
            <span>${s.createdAt ? esc(String(s.createdAt).slice(0, 10)) : ''}</span>
            <button class="learn-del" data-kind="play" data-id="${esc(s.id)}" title="Remove this play">✕</button>
          </div>
        </div>`).join('')
    : `<div class="result-card" style="color:var(--text-muted);text-align:center;padding:24px">
         No plays yet.<br>Add a real retention win — the AI will reuse its moves.
       </div>`;

  contentEl.innerHTML = `
    <div class="settings-screen">
      <button class="settings-back" id="learnings-back-btn">← Back</button>
      <h2>🎓 Learning Center</h2>
      <div class="settings-box">
        Everything here is injected into <strong>every</strong> future analysis and email.
        <strong>Rules</strong> come from your corrections; <strong>Playbook</strong> holds real wins the AI pattern-matches against.
      </div>
      <div class="tab-bar">
        <button class="tab-btn ${tab === 'rules' ? 'active' : ''}" id="learn-tab-rules">📏 Rules (${rules.length})</button>
        <button class="tab-btn ${tab === 'plays' ? 'active' : ''}" id="learn-tab-plays">🏆 Playbook (${plays.length})</button>
      </div>
      ${tab === 'plays' ? `<button class="btn btn-story btn-sm" id="add-story-btn">➕ Add Success Story</button>` : ''}
      <div class="learn-list">${tab === 'rules' ? ruleItems : playItems}</div>
    </div>`;

  document.getElementById('learnings-back-btn')?.addEventListener('click', () => {
    transition(appState.prevPhase || STATE.COMPLETE);
  });
  document.getElementById('learn-tab-rules')?.addEventListener('click', () => { appState.learnTab = 'rules'; render(); });
  document.getElementById('learn-tab-plays')?.addEventListener('click', () => { appState.learnTab = 'plays'; render(); });
  document.getElementById('add-story-btn')?.addEventListener('click', () => {
    appState._storyDraft = { accountName: '', churnCategory: '', situation: '', actions: '', outcome: '' };
    transition(STATE.STORY_INPUT, { prevPhase: STATE.LEARNINGS });
  });
  document.querySelectorAll('.learn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const isPlay = btn.dataset.kind === 'play';
      chrome.runtime.sendMessage(
        { type: isPlay ? 'DELETE_STORY' : 'DELETE_LEARNING', payload: { id: btn.dataset.id } },
        (res) => {
          if (isPlay) {
            appState.playbook = res?.data || [];
            appState.playbookApplied = appState.playbook.length;
          } else {
            appState.learnings = res?.data || [];
            appState.learningsApplied = appState.learnings.length;
          }
          render();
        }
      );
    });
  });
}

// ── Success story capture form ─────────────────────────────────────────────────
const CHURN_CATEGORIES = ['Price', 'Product Fit', 'Support Issues', 'Competition', 'Budget Cuts', 'Low Adoption', 'Relationship', 'Unknown'];

function renderStoryInput() {
  const d = appState._storyDraft || {};
  const catOptions = CHURN_CATEGORIES.map(c =>
    `<option value="${esc(c)}" ${new RegExp(c, 'i').test(d.churnCategory || '') ? 'selected' : ''}>${esc(c)}</option>`
  ).join('');

  contentEl.innerHTML = `
    <div class="settings-screen">
      <button class="settings-back" id="story-back-btn">← Back</button>
      <h2>🏆 Add Success Story</h2>
      <div class="settings-box">
        Capture a real retention win. The AI distills <strong>why it worked</strong> and reuses the moves on similar accounts.
      </div>

      <div class="form-group">
        <label>Account name</label>
        <input type="text" id="story-account" placeholder="e.g. Al Amal Trading Co." value="${esc(d.accountName || '')}">
      </div>

      <div class="form-group">
        <label>Why did they churn?</label>
        <select id="story-category">${catOptions}</select>
      </div>

      <div class="form-group">
        <label>The situation</label>
        <textarea id="story-situation" class="teach-textarea" rows="3"
          placeholder="Context of the churn — e.g. 'Cancelled after a billing dispute; felt support was slow and got a cheaper quote from a competitor.'">${esc(d.situation || '')}</textarea>
      </div>

      <div class="form-group">
        <label>What you did that worked (the steps)</label>
        <textarea id="story-actions" class="teach-textarea" rows="4"
          placeholder="The winning moves — e.g. 'Called the owner directly (not the accountant), apologized for the billing mess, offered a 3-month bridge at the old price, and set up a monthly check-in call.'">${esc(d.actions || '')}</textarea>
      </div>

      <div class="form-group">
        <label>The outcome</label>
        <textarea id="story-outcome" class="teach-textarea" rows="2"
          placeholder="e.g. 'Renewed for 12 months within 2 weeks, later upgraded to the annual plan.'">${esc(d.outcome || '')}</textarea>
      </div>

      <button class="btn btn-primary" id="story-save-btn">💾 Save to Playbook</button>
      <div id="story-status" class="teach-status" style="min-height:16px"></div>
    </div>`;

  document.getElementById('story-back-btn')?.addEventListener('click', () => {
    transition(appState.prevPhase || STATE.COMPLETE);
  });

  document.getElementById('story-save-btn')?.addEventListener('click', () => {
    const payload = {
      accountName:   document.getElementById('story-account')?.value || '',
      churnCategory: document.getElementById('story-category')?.value || 'Unknown',
      situation:     document.getElementById('story-situation')?.value || '',
      actions:       document.getElementById('story-actions')?.value || '',
      outcome:       document.getElementById('story-outcome')?.value || ''
    };
    if (!payload.situation.trim() && !payload.actions.trim()) {
      document.getElementById('story-status').textContent = 'Fill in at least the situation or the steps — that is the play.';
      document.getElementById('story-situation')?.focus();
      return;
    }
    const btn = document.getElementById('story-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Distilling & saving…'; }
    chrome.runtime.sendMessage({ type: 'SAVE_SUCCESS_STORY', payload }, (res) => {
      if (res?.success) {
        appState.playbook = res.playbook || [];
        appState.playbookApplied = appState.playbook.length;
        appState._storyDraft = null;
        appState.learnTab = 'plays';
        transition(STATE.LEARNINGS, { prevPhase: appState.prevPhase === STATE.LEARNINGS ? STATE.IDLE : appState.prevPhase });
      } else {
        const st = document.getElementById('story-status');
        if (st) st.textContent = res?.error || 'Could not save — try again.';
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save to Playbook'; }
      }
    });
  });
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
      <div class="email-refine">
        <textarea id="email-refine-input" class="teach-textarea" rows="2"
          placeholder="Refine this email: e.g. 'shorter and warmer', 'mention the July discount', 'drop the data-deletion line'"></textarea>
        <button class="btn btn-secondary btn-sm" id="refine-email-btn">↻ Refine Email</button>
      </div>
      <div class="email-actions">
        <button class="btn btn-primary" id="copy-full-email-btn">📋 Copy Full Email</button>
        <button class="btn btn-secondary btn-sm" id="regenerate-btn">↺ Edit Note &amp; Redo</button>
        <button class="btn btn-secondary btn-sm" id="back-to-analysis-btn">← Back to Analysis</button>
      </div>` : ''}
    </div>`;

  document.getElementById('email-result-back-btn')?.addEventListener('click', () => {
    transition(STATE.EMAIL_INPUT);
  });
  document.getElementById('refine-email-btn')?.addEventListener('click', () => {
    const refine = document.getElementById('email-refine-input')?.value?.trim();
    if (!refine) { document.getElementById('email-refine-input')?.focus(); return; }
    transition(STATE.EMAIL_DRAFT, { emailText: '', emailStreaming: true });
    chrome.runtime.sendMessage({
      type: 'DRAFT_EMAIL',
      payload: { tabId: appState.currentTabId, userNote: appState._emailNote || '', correction: refine }
    });
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
      <h2>AI Settings</h2>

      <div class="form-group">
        <label>AI Provider</label>
        <select id="ai-provider">
          <option value="gemini">Google Gemini — free tier available</option>
          <option value="anthropic">Anthropic Claude — highest quality</option>
        </select>
      </div>

      <div id="gemini-fields">
        <div class="settings-box">
          <strong>Get your free Gemini API key</strong><br>
          <ol>
            <li>Go to <strong>aistudio.google.com/apikey</strong></li>
            <li>Sign in → click "Create API Key"</li>
            <li>Paste it below — ~1M tokens/min free</li>
          </ol>
        </div>
        <div class="form-group">
          <label>Gemini API Key</label>
          <input type="password" id="gemini-key" placeholder="AIza…" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Gemini Model</label>
          <select id="gemini-model">
            <option value="gemini-2.5-flash">gemini-2.5-flash — best speed + quality (default)</option>
            <option value="gemini-2.5-flash-lite-preview-06-17">gemini-2.5-flash-lite — fastest</option>
            <option value="gemini-flash-latest">gemini-flash-latest — always latest Flash</option>
          </select>
        </div>
      </div>

      <div id="anthropic-fields" style="display:none">
        <div class="settings-box">
          <strong>Get your Anthropic API key</strong><br>
          <ol>
            <li>Go to <strong>platform.claude.com</strong></li>
            <li>Sign in → API Keys → "Create Key"</li>
            <li>Paste it below (paid — pay per use)</li>
          </ol>
        </div>
        <div class="form-group">
          <label>Anthropic API Key</label>
          <input type="password" id="anthropic-key" placeholder="sk-ant-…" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Claude Model</label>
          <select id="anthropic-model">
            <option value="claude-opus-4-8">claude-opus-4-8 — most capable (default)</option>
            <option value="claude-sonnet-5">claude-sonnet-5 — near-Opus quality, lower cost</option>
            <option value="claude-haiku-4-5">claude-haiku-4-5 — fastest + cheapest</option>
          </select>
        </div>
      </div>

      <span class="form-hint">Keys are stored on this device only (chrome.storage.local) — they do not sync to your other devices.</span>

      <div class="form-group consent-box">
        <label class="consent-label">
          <input type="checkbox" id="ai-consent">
          <span>I understand that running an analysis or drafting an email sends the subscription record — including chatter and internal CSM notes — to the selected AI provider (Google Gemini or Anthropic Claude) for processing. Do not enable this for data you are not permitted to share with a third-party AI provider.</span>
        </label>
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

  function syncProviderFields() {
    const p = document.getElementById('ai-provider')?.value || 'gemini';
    document.getElementById('gemini-fields').style.display    = p === 'gemini' ? '' : 'none';
    document.getElementById('anthropic-fields').style.display = p === 'anthropic' ? '' : 'none';
  }

  function collectSettings() {
    return {
      aiProvider:      document.getElementById('ai-provider').value,
      geminiApiKey:    document.getElementById('gemini-key').value.trim(),
      geminiModel:     document.getElementById('gemini-model').value,
      anthropicApiKey: document.getElementById('anthropic-key').value.trim(),
      anthropicModel:  document.getElementById('anthropic-model').value,
      emailSignature:  document.getElementById('email-sig').value,
      aiConsent:       document.getElementById('ai-consent').checked
    };
  }

  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (res?.data) {
      const d = res.data;
      if (d.aiProvider)      document.getElementById('ai-provider').value     = d.aiProvider;
      if (d.geminiApiKey)    document.getElementById('gemini-key').value      = d.geminiApiKey;
      if (d.geminiModel)     document.getElementById('gemini-model').value    = d.geminiModel;
      if (d.anthropicApiKey) document.getElementById('anthropic-key').value   = d.anthropicApiKey;
      if (d.anthropicModel)  document.getElementById('anthropic-model').value = d.anthropicModel;
      if (d.emailSignature)  document.getElementById('email-sig').value       = d.emailSignature;
      const consentEl = document.getElementById('ai-consent');
      if (consentEl) consentEl.checked = d.aiConsent === true;
      syncProviderFields();
    }
  });

  document.getElementById('ai-provider')?.addEventListener('change', syncProviderFields);

  document.getElementById('settings-back-btn')?.addEventListener('click', () => {
    transition(appState.prevPhase || STATE.IDLE);
  });

  document.getElementById('test-btn')?.addEventListener('click', () => {
    const statusEl = document.getElementById('gemini-status');
    statusEl.textContent = 'Testing…';
    const payload = collectSettings();
    const modelLabel = payload.aiProvider === 'anthropic' ? payload.anthropicModel : payload.geminiModel;
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload }, () => {
      chrome.runtime.sendMessage({ type: 'CHECK_GEMINI' }, (res) => {
        if (res?.data?.available) {
          statusEl.innerHTML = `<span style="color:var(--success)">✓ Connected — ${esc(modelLabel)}</span>`;
          appState.geminiStatus = true;
        } else {
          statusEl.innerHTML = `<span style="color:var(--danger)">✕ Connection failed — check your API key</span>`;
          appState.geminiStatus = false;
        }
      });
    });
  });

  document.getElementById('save-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: collectSettings() }, () => {
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
          learningsApplied: msg.payload.learningsApplied ?? appState.learningsApplied,
          playbookApplied: msg.payload.playbookApplied ?? appState.playbookApplied,
          teachStatus: '',
          _rating: null,
          _correctionDraft: '',
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
  // Check AI provider availability in background
  chrome.runtime.sendMessage({ type: 'CHECK_GEMINI' }, (res) => {
    appState.geminiStatus = res?.data?.available ?? false;
    if (appState.phase === STATE.IDLE) render();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { transition(STATE.IDLE); return; }

  appState.currentTabId = tab.id;

  // Load learned rules + playbook so the applied counts are accurate on restore.
  const learnRes = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_LEARNINGS' }, r));
  appState.learnings = learnRes?.data || [];
  appState.learningsApplied = appState.learnings.length;
  const playRes = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_PLAYBOOK' }, r));
  appState.playbook = playRes?.data || [];
  appState.playbookApplied = appState.playbook.length;

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
