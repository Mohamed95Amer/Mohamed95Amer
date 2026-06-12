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
}

// Update 👍/👎 feedback on the most recent entry's activities after the fact
export async function setLatestFeedback(partnerKey, feedback) {
  const mem = await getAccountMemory(partnerKey);
  if (!mem?.entries?.length) return;
  mem.entries[0].feedback = { ...(mem.entries[0].feedback || {}), ...feedback };
  await chrome.storage.local.set({ [`csm_memory_${partnerKey}`]: mem });
}

// ── Prompt-injection builders ────────────────────────────────────────────────

function describeEditDelta(proposed, final, feedback = {}) {
  const lines = [];
  const finalBySummary = new Map((final || []).map(a => [a.summary, a]));
  (proposed || []).forEach((p, i) => {
    const fb = feedback[i] === 'up' ? ' [CSM rated 👍]' : feedback[i] === 'down' ? ' [CSM rated 👎 — avoid this pattern]' : '';
    const kept = finalBySummary.get(p.summary);
    if (!kept && !(final || []).some(f => f.notes === p.notes)) {
      lines.push(`  - PROPOSED but DELETED by CSM: ${p.activityType} — "${p.summary}"${fb}`);
    } else {
      lines.push(`  - CREATED: ${p.activityType} — "${p.summary}" (due ${p.dueDate})${fb}`);
    }
  });
  for (const f of final || []) {
    if (!(proposed || []).some(p => p.summary === f.summary)) {
      lines.push(`  - ADDED manually by CSM: ${f.activityType} — "${f.summary}" (the AI missed this need)`);
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
export async function buildLikedExamplesBlock(limit = 2) {
  const index = await getIndex();
  const keys = Object.keys(index).sort((a, b) => index[b].lastUpdated - index[a].lastUpdated).slice(0, 15);
  if (!keys.length) return '';
  const stores = await chrome.storage.local.get(keys.map(k => `csm_memory_${k}`));
  const liked = [];
  for (const k of keys) {
    const mem = stores[`csm_memory_${k}`];
    for (const e of mem?.entries || []) {
      for (const [i, verdict] of Object.entries(e.feedback || {})) {
        const act = (e.finalActivities || e.proposedActivities || [])[i];
        if (verdict === 'up' && act?.summary && act?.notes) {
          liked.push(act);
          if (liked.length >= limit) break;
        }
      }
      if (liked.length >= limit) break;
    }
    if (liked.length >= limit) break;
  }
  if (!liked.length) return '';
  const lines = ['\n## Activities This CSM Previously Rated 👍 (match this style and specificity)'];
  for (const a of liked) {
    lines.push(`- ${a.activityType} — "${a.summary}"\n  ${String(a.notes).split('\n').slice(0, 3).join('\n  ')}`);
  }
  return lines.join('\n');
}
