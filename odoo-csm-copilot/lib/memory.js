// Per-account review memory — the learning layer.
//
// Every executed review is persisted to chrome.storage.local, keyed by the
// customer's commercial partner (falling back to a normalized company name).
// The next analysis of the same account receives:
//   - the prior plans' activities (created vs edited vs deleted vs 👍/👎)
//   - a "what changed since last review" diff computed in code
//   - globally 👍-rated activities as few-shot style examples
//
// Storage shape (chrome.storage.local):
//   csm_memory_index: { [partnerKey]: { customerName, lastUpdated } }
//   csm_memory_<partnerKey>: { partnerKey, customerName, entries: [ReviewEntry] }
//
// ReviewEntry: {
//   date: ISO string, soNumber,
//   healthTier, daysUntilRenewal, utilization, recurringAmount,
//   planText (capped),
//   proposedActivities: [{activityType, summary, dueDate, notes}],
//   finalActivities:    [...same, as edited by the CSM before creation],
//   feedback: { [index]: 'up' | 'down' },
//   created: bool
// }

const MAX_ENTRIES_PER_ACCOUNT = 5;
const MAX_ACCOUNTS = 60;
const MAX_PLAN_CHARS = 6000;
const LIKED_INDEX_KEY = 'csm_liked_examples';
const MAX_LIKED = 10;

export function partnerKeyFor(odooData) {
  if (odooData?.partnerId) return `p${odooData.partnerId}`;
  const name = (odooData?.customerName || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '_').slice(0, 60);
  return name ? `n_${name}` : null;
}

async function getIndex() {
  const r = await chrome.storage.local.get('csm_memory_index');
  return r.csm_memory_index || {};
}

export async function getAccountMemory(partnerKey) {
  if (!partnerKey) return null;
  const key = `csm_memory_${partnerKey}`;
  const r = await chrome.storage.local.get(key);
  return r[key] || null;
}

export async function recordReview(partnerKey, customerName, entry) {
  if (!partnerKey) return;
  const key = `csm_memory_${partnerKey}`;
  const mem = (await getAccountMemory(partnerKey)) || { partnerKey, customerName, entries: [] };
  mem.customerName = customerName || mem.customerName;
  mem.entries.unshift({
    ...entry,
    planText: (entry.planText || '').slice(0, MAX_PLAN_CHARS),
    date: entry.date || new Date().toISOString()
  });
  mem.entries = mem.entries.slice(0, MAX_ENTRIES_PER_ACCOUNT);

  const index = await getIndex();
  index[partnerKey] = { customerName: mem.customerName, lastUpdated: Date.now() };

  // LRU-evict oldest accounts beyond the cap so memory stays bounded
  const keys = Object.keys(index);
  if (keys.length > MAX_ACCOUNTS) {
    const evict = keys.sort((a, b) => index[a].lastUpdated - index[b].lastUpdated)
      .slice(0, keys.length - MAX_ACCOUNTS);
    for (const k of evict) delete index[k];
    await chrome.storage.local.remove(evict.map(k => `csm_memory_${k}`));
  }

  await chrome.storage.local.set({ [key]: mem, csm_memory_index: index });
  await indexLikedExamples(mem.entries[0]);
}

// Update 👍/👎 feedback on the most recent entry's activities after the fact
export async function setLatestFeedback(partnerKey, feedback) {
  const mem = await getAccountMemory(partnerKey);
  if (!mem?.entries?.length) return;
  mem.entries[0].feedback = { ...(mem.entries[0].feedback || {}), ...feedback };
  await chrome.storage.local.set({ [`csm_memory_${partnerKey}`]: mem });
  await indexLikedExamples(mem.entries[0]);
}

// Maintain a small flat index of 👍'd activities so buildLikedExamplesBlock is
// an O(1) read instead of scanning ~15 account blobs on every analysis.
async function indexLikedExamples(entry) {
  if (!entry) return;
  const list = entry.finalActivities || entry.proposedActivities || [];
  const liked = [];
  for (const [i, verdict] of Object.entries(entry.feedback || {})) {
    const act = list[i];
    if (verdict === 'up' && act?.summary && act?.notes) {
      liked.push({ activityType: act.activityType, summary: act.summary, notes: act.notes });
    }
  }
  if (!liked.length) return;
  const r = await chrome.storage.local.get(LIKED_INDEX_KEY);
  const existing = r[LIKED_INDEX_KEY] || [];
  // newest first, de-duped by summary, capped
  const merged = [...liked, ...existing]
    .filter((a, i, arr) => arr.findIndex(b => b.summary === a.summary) === i)
    .slice(0, MAX_LIKED);
  await chrome.storage.local.set({ [LIKED_INDEX_KEY]: merged });
}

// Record what actually happened to a prior review's created activities, found
// by reconciling against live Odoo state (see reconcilePriorOutcomes in the SW).
// outcomes: [{ summary, state: 'done' | 'open' | 'overdue', daysOpen? }]
export async function recordOutcomes(partnerKey, outcomes) {
  if (!partnerKey || !outcomes?.length) return;
  const mem = await getAccountMemory(partnerKey);
  if (!mem?.entries?.length) return;
  // Attach to the most recent entry whose activities were created
  const entry = mem.entries.find(e => e.created) || mem.entries[0];
  entry.outcomes = outcomes;
  entry.outcomesAt = Date.now();
  await chrome.storage.local.set({ [`csm_memory_${partnerKey}`]: mem });
}

// Find the most recent created review (for outcome reconciliation in the SW).
export async function getLastCreatedReview(partnerKey) {
  const mem = await getAccountMemory(partnerKey);
  return mem?.entries?.find(e => e.created && e.finalActivities?.length) || null;
}

// ── Prompt-injection builders ────────────────────────────────────────────────

function describeEditDelta(proposed, final, feedback = {}) {
  const lines = [];
  const finalList = final || [];
  const finalBySummary = new Map(finalList.map(a => [a.summary, a]));
  // feedback is keyed to the FINAL (CSM-edited / created) activity indices — the
  // same convention buildLikedExamplesBlock uses. Look it up by each final
  // activity's position, NOT by the proposed index (the two lists diverge
  // whenever the CSM deletes or blanks an activity before creating).
  const fbFor = (act) => {
    const i = act ? finalList.indexOf(act) : -1;
    return feedback[i] === 'up' ? ' [CSM rated 👍]'
         : feedback[i] === 'down' ? ' [CSM rated 👎 — avoid this pattern]' : '';
  };
  (proposed || []).forEach((p) => {
    const kept = finalBySummary.get(p.summary) || finalList.find(f => f.notes === p.notes);
    if (!kept) {
      lines.push(`  - PROPOSED but DELETED by CSM: ${p.activityType} — "${p.summary}"`);
    } else {
      lines.push(`  - CREATED: ${p.activityType} — "${p.summary}" (due ${kept.dueDate})${fbFor(kept)}`);
    }
  });
  for (const f of finalList) {
    if (!(proposed || []).some(p => p.summary === f.summary)) {
      lines.push(`  - ADDED manually by CSM: ${f.activityType} — "${f.summary}" (the AI missed this need)${fbFor(f)}`);
    }
  }
  return lines;
}

// "What changed since last review" — deterministic diff, computed in code
export function buildChangeSinceLastReview(memEntry, odooData) {
  if (!memEntry) return '';
  const out = [];
  const fmt = (v) => v == null ? 'unknown' : v;
  if (memEntry.healthTier && odooData.healthTierNow && memEntry.healthTier !== odooData.healthTierNow) {
    out.push(`- Health tier changed: ${memEntry.healthTier} → ${odooData.healthTierNow}`);
  }
  if (memEntry.utilization != null && odooData.dbInfo?.utilization != null && memEntry.utilization !== odooData.dbInfo.utilization) {
    const dir = odooData.dbInfo.utilization > memEntry.utilization ? '↑ improved' : '↓ dropped';
    out.push(`- Utilization: ${memEntry.utilization}% → ${odooData.dbInfo.utilization}% (${dir})`);
  }
  if (memEntry.recurringAmount && odooData.recurringAmount && String(memEntry.recurringAmount) !== String(odooData.recurringAmount)) {
    out.push(`- Recurring amount: ${memEntry.recurringAmount} → ${odooData.recurringAmount}`);
  }
  if (memEntry.daysUntilRenewal != null && odooData.daysUntilRenewal != null) {
    out.push(`- Renewal: was ${fmt(memEntry.daysUntilRenewal)}d away at last review, now ${fmt(odooData.daysUntilRenewal)}d`);
  }
  return out.join('\n');
}

// The block injected into the action-plan prompt. Includes prior activities with
// the CSM's edit/feedback verdicts so the model stops repeating rejected ideas
// and doesn't re-propose what was already scheduled.
export function buildMemoryBlock(memory, odooData) {
  if (!memory?.entries?.length) return '';
  const lines = ['\n## Prior CSM Reviews of This Account (memory — use to avoid repetition)'];
  for (const e of memory.entries.slice(0, 2)) {
    const when = (e.date || '').slice(0, 10);
    lines.push(`\n### Review on ${when} (${e.soNumber || ''}, health then: ${e.healthTier || 'unknown'})`);
    const delta = describeEditDelta(e.proposedActivities, e.finalActivities, e.feedback);
    if (delta.length) lines.push(...delta);
    // Outcomes reconciled from live Odoo — the strongest learning signal
    if (e.outcomes?.length) {
      lines.push('  Outcomes since then:');
      for (const o of e.outcomes) {
        const tag = o.state === 'done' ? 'DONE (completed in Odoo — this play worked)'
          : o.state === 'overdue' ? `STILL OPEN & OVERDUE${o.daysOpen != null ? ` (${o.daysOpen}d)` : ''} — the CSM hasn't acted; reconsider whether it was the right call`
          : 'still open';
        lines.push(`    • "${o.summary}" → ${tag}`);
      }
    }
  }
  const changes = buildChangeSinceLastReview(memory.entries[0], odooData);
  if (changes) {
    lines.push('\n### What Changed Since the Last Review (pre-computed)');
    lines.push(changes);
  }
  lines.push('\nMEMORY RULES:');
  lines.push('- Do NOT re-propose an activity that was already CREATED recently unless its due date has passed and the issue persists.');
  lines.push('- Do NOT repeat patterns the CSM DELETED or rated 👎.');
  lines.push('- If the CSM manually ADDED an activity type last time, consider whether the same need applies now.');
  lines.push('- Reference "What Changed" explicitly in the Situation Assessment.');
  return lines.join('\n');
}

// Cross-account 👍 examples — few-shot style guidance ("learns your style").
// O(1) read from the flat liked-examples index (maintained by indexLikedExamples).
export async function buildLikedExamplesBlock(limit = 2) {
  const r = await chrome.storage.local.get(LIKED_INDEX_KEY);
  const liked = (r[LIKED_INDEX_KEY] || []).slice(0, limit);
  if (!liked.length) return '';
  const lines = ['\n## Activities This CSM Previously Rated 👍 (match this style and specificity)'];
  for (const a of liked) {
    lines.push(`- ${a.activityType} — "${a.summary}"\n  ${String(a.notes).split('\n').slice(0, 3).join('\n  ')}`);
  }
  return lines.join('\n');
}
