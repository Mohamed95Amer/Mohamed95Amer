function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysFromToday(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

async function rpc(baseUrl, params) {
  const res = await fetch(`${baseUrl}/web/dataset/call_kw`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || json.error.message || 'RPC error');
  return json.result;
}

async function getSessionUid(baseUrl) {
  const res = await fetch(`${baseUrl}/web/session/get_session_info`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: {} })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const uid = json?.result?.uid;
  if (!uid) throw new Error('Not logged in to Odoo');
  return uid;
}

async function fetchOverdueActivities(baseUrl, uid, includeToday = true) {
  const today = toISODate(new Date());
  const op = includeToday ? '<=' : '<';
  return rpc(baseUrl, {
    model: 'mail.activity',
    method: 'search_read',
    args: [[['user_id', '=', uid], ['date_deadline', op, today]]],
    kwargs: { fields: ['id', 'date_deadline'], order: 'date_deadline asc', limit: 500 }
  });
}

async function fetchFutureActivities(baseUrl, uid) {
  const today = toISODate(new Date());
  return rpc(baseUrl, {
    model: 'mail.activity',
    method: 'search_read',
    args: [[['user_id', '=', uid], ['date_deadline', '>', today]]],
    kwargs: { fields: ['id', 'date_deadline'], limit: 2000 }
  });
}

function buildDayCountMap(futureActivities) {
  const map = {};
  for (const act of futureActivities) {
    const d = act.date_deadline;
    map[d] = (map[d] || 0) + 1;
  }
  return map;
}

function buildDistributionPlan(overdueIds, dayCountMap, maxPerDay) {
  const plan = [];
  let remaining = [...overdueIds];
  let offset = 1;

  while (remaining.length > 0) {
    if (offset > 60) throw new Error('Could not fit all activities within 60 days');

    const candidate = daysFromToday(offset);
    const dow = candidate.getDay();
    if (dow === 0 || dow === 6) { offset++; continue; }

    const dateStr = toISODate(candidate);
    const available = maxPerDay - (dayCountMap[dateStr] || 0);

    if (available > 0) {
      plan.push({ date: dateStr, ids: remaining.splice(0, available) });
    }

    offset++;
  }

  return plan;
}

async function applyPlan(baseUrl, plan) {
  for (const { date, ids } of plan) {
    await rpc(baseUrl, {
      model: 'mail.activity',
      method: 'write',
      args: [ids, { date_deadline: date }],
      kwargs: {}
    });
  }
}

export async function rescheduleOverdueActivities(baseUrl, maxPerDay = 18, includeToday = true) {
  const uid = await getSessionUid(baseUrl);

  const overdue = await fetchOverdueActivities(baseUrl, uid, includeToday);
  if (overdue.length === 0) {
    return { count: 0, days: 0, firstDate: null, lastDate: null };
  }

  const overdueIds = overdue.map(a => a.id);
  const future = await fetchFutureActivities(baseUrl, uid);
  const dayCountMap = buildDayCountMap(future);
  const plan = buildDistributionPlan(overdueIds, dayCountMap, maxPerDay);

  await applyPlan(baseUrl, plan);

  return {
    count: overdueIds.length,
    days: plan.length,
    firstDate: plan[0].date,
    lastDate: plan[plan.length - 1].date
  };
}
