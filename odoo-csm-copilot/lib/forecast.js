// Forecast cross-check — pure logic, no chrome.* / DOM dependencies so it can
// be unit-tested in Node and reused from both the side panel and the worker.
//
// Direction of the check: it starts from MY Odoo subscriptions and searches
// the sheet for each of them — the sheet holds the WHOLE department's
// accounts, so sheet rows that match nobody of mine belong to colleagues and
// are ignored, never reported.
//
// Inputs:
//   sheetRows    — parsed forecast sheet (all departments)
//   odooAccounts — sale.order subscription records fetched for me, each marked
//                  isFutureUser (forecasted onto me) / isSalesperson (owned by
//                  me). One CUSTOMER often has several records (active sub,
//                  replaced 5_renewed order, draft quotes, upsells), so all
//                  checks aggregate per customer, never per order.
//
// Outputs:
//   A. unforecasted   — accounts that should be added to the forecast:
//        A1 I'm salesperson (active sub), NOT the future user, not in the sheet
//        A2 MY sheet lines with Check Churn = 1 (excluded by churn tag)
//      grouped by Year → Quarter → Month of next invoice date and filtered to
//      the target year (off-year entries returned separately, not dropped)
//   B. wronglyForecasted — MY forecasted-book rows (future user = me) with
//      Check Churn = 0 that should not be forecasted. Deliberately NOT
//      year-filtered: a row in this year's sheet is relevant whenever the
//      churn/handover happened.
//        B1 customer churned in Odoo (before handover when handover is known)
//        B2 churn tag present in Odoo but the sheet still says 0
//        B3 forecast starts in an earlier MONTH than the account was received
//   bookNotInSheet — accounts forecasted onto me (future user) that the sheet
//      is missing entirely.
//
// When the Odoo instance has no detectable future-user field
// (futureUserKnown=false), my salesperson accounts stand in for the book.

export const CHURN_TAG_RE = /churn/i;
const ACTIVE_STATE_RE = /progress|paused/i;
const CHURN_STATE_RE = /churn/i;

// ── Name normalization / join key ────────────────────────────────────────────

const LEGAL_SUFFIXES = [
  'llc', 'l l c', 'fz llc', 'fz-llc', 'fzllc', 'fze', 'fzc', 'fzco', 'dmcc',
  'ltd', 'limited', 'inc', 'incorporated', 'co', 'company', 'corp', 'corporation',
  'est', 'establishment', 'gmbh', 'sarl', 'sal', 'wll', 'w l l', 'plc', 'pvt',
  'general trading', 'trading'
];

export function normalizeName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')   // keep latin + arabic letters/digits
    .replace(/\s+/g, ' ')
    .trim();
  // Collapse runs of single letters so "F.Z.E" / "L.L.C" match "FZE" / "LLC"
  s = s.replace(/\b(?:[a-z] )+[a-z]\b/g, m => m.replace(/ /g, ''));
  // Strip trailing legal suffixes repeatedly ("acme general trading llc" → "acme")
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s === suf) continue; // never reduce a name to nothing
      if (s.endsWith(' ' + suf)) { s = s.slice(0, -suf.length - 1).trim(); changed = true; }
    }
  }
  return s;
}

// ── Flexible date parsing (Excel serials, ISO, dd/mm/yyyy, JS Date) ──────────

export function parseDateFlexible(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    // SheetJS cellDates produces UTC-midnight Dates; reading those with local
    // getters shifts −1 day in behind-UTC timezones, so read them as UTC.
    if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0) {
      return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
    }
    return v;
  }
  if (typeof v === 'number' && isFinite(v)) {
    // Excel serial (1900 date system, epoch 1899-12-30)
    if (v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    return null;
  }
  const s = String(v).trim();
  if (!s || /^(n\/?a|none|null|-+)$/i.test(s)) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);           // ISO
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);    // dd/mm/yyyy (day-first)
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }  // clearly mm/dd
    return new Date(+m[3], mo - 1, d);
  }

  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})$/);    // dd/mm/yy
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    return new Date(2000 + +m[3], mo - 1, d);
  }

  const parsed = new Date(s);                                 // "Mar 1, 2026" etc.
  return isNaN(parsed) ? null : parsed;
}

export function isoDate(d) {
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Single source of the Year/Quarter/Month derivation — the on-screen grouping
// and the Excel export must never disagree.
export function yqmOf(d) {
  if (!d) return { year: null, quarter: null, month: null, monthNum: 0 };
  return {
    year: d.getFullYear(),
    quarter: 'Q' + (Math.floor(d.getMonth() / 3) + 1),
    month: d.toLocaleString('en', { month: 'long' }),
    monthNum: d.getMonth() + 1
  };
}

// ── Sheet header mapping ─────────────────────────────────────────────────────

// Each logical column with regexes tried in order against normalized headers.
const HEADER_PATTERNS = {
  account:        [/^(account|customer|partner|company)(\s*name)?$/, /account/, /customer/, /partner/],
  transitionDate: [/^transition\s*date$/, /transition/, /transfer\s*date/, /start.*forecast/],
  tags:           [/^subscription\s*tags?$/, /\btags?\b/],
  checkChurn:     [/^check\s*churn$/, /check.*churn/, /churn.*check/, /^churn$/],
  soNumber:       [/^(so|order|subscription)\s*(number|no|#|ref)/, /^so\b/, /order\s*ref/, /subscription\s*(code|id)/]
};

export function mapHeaders(headers) {
  const norm = headers.map(h => String(h ?? '').toLowerCase().replace(/[_\s]+/g, ' ').trim());
  const mapping = {};
  const used = new Set();
  for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
    for (const re of patterns) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h && re.test(h));
      if (idx !== -1) { mapping[key] = idx; used.add(idx); break; }
    }
  }
  return mapping; // { account: 0, transitionDate: 3, ... } — keys absent when not found
}

// Convert raw AOA (array-of-arrays from SheetJS) + mapping into normalized rows.
export function parseSheetRows(aoa, mapping) {
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every(c => c == null || String(c).trim() === '')) continue;
    const accountName = String(r[mapping.account] ?? '').trim();
    if (!accountName) continue;
    const churnRaw = mapping.checkChurn != null ? r[mapping.checkChurn] : '';
    const churnNum = Number(String(churnRaw ?? '').trim());
    rows.push({
      rowIndex: i + 1, // 1-based incl. header, matches what the user sees in Excel
      accountName,
      key: normalizeName(accountName),
      soNumber: mapping.soNumber != null ? String(r[mapping.soNumber] ?? '').trim() : '',
      transitionDate: mapping.transitionDate != null ? parseDateFlexible(r[mapping.transitionDate]) : null,
      tags: mapping.tags != null ? String(r[mapping.tags] ?? '').trim() : '',
      checkChurn: churnNum === 1 ? 1 : 0
    });
  }
  return rows;
}

// ── Grouping by Year / Quarter / Month of next invoice date ──────────────────

export function groupByYQM(items, getDate) {
  const groups = {};
  for (const it of items) {
    const { year, quarter, month, monthNum } = yqmOf(getDate(it));
    const yearKey = year ?? 'No date';
    const quarterKey = quarter ?? '—';
    const monthKey = month ?? '—';
    if (!groups[yearKey]) groups[yearKey] = {};
    if (!groups[yearKey][quarterKey]) groups[yearKey][quarterKey] = {};
    if (!groups[yearKey][quarterKey][monthKey]) {
      groups[yearKey][quarterKey][monthKey] = { monthNum, items: [] };
    }
    groups[yearKey][quarterKey][monthKey].items.push(it);
  }
  return groups;
}

// ── Customer aggregation ──────────────────────────────────────────────────────

// Collapse the per-order records into one entry per customer.
function aggregateCustomers(odooAccounts) {
  const customers = new Map(); // partner key → customer
  for (const acc of odooAccounts) {
    const key = normalizeName(acc.partner);
    if (!customers.has(key)) customers.set(key, { key, name: acc.partner, orders: [] });
    customers.get(key).orders.push(acc);
  }

  for (const c of customers.values()) {
    const active = c.orders.filter(o => ACTIVE_STATE_RE.test(o.state || ''));
    const churnedOrders = c.orders.filter(o => CHURN_STATE_RE.test(o.state || ''));

    // Roles: forecasted onto me (future user) vs merely owned by me. Orders
    // without role flags (older callers/tests) default to salesperson-owned.
    c.isFutureUser = c.orders.some(o => !!o.isFutureUser);
    c.isSalesperson = c.orders.some(o => o.isSalesperson !== false);

    // Representative = the order whose dates/amounts we report: the active
    // subscription with the earliest upcoming invoice, else the newest order.
    const byNextInvoice = [...active].sort((a, b) =>
      String(a.nextInvoiceDate || '9999').localeCompare(String(b.nextInvoiceDate || '9999')));
    const byRecency = [...c.orders].sort((a, b) =>
      String(b.startDate || '').localeCompare(String(a.startDate || '')) || (b.id - a.id));
    c.rep = byNextInvoice[0] || byRecency[0];

    c.hasActive = active.length > 0;
    // State is authoritative: a customer with ANY active subscription is not
    // churned, no matter what old orders/log events say (churn-then-renew).
    c.churned = !c.hasActive && churnedOrders.length > 0;
    c.churnDate = churnedOrders.map(o => o.churnDate).filter(Boolean).sort().pop()
      || c.orders.map(o => o.churnDate).filter(Boolean).sort().pop() || null;
    c.tags = [...new Set(c.orders.flatMap(o => o.tags || []))];
    // Latest date any of the customer's orders was assigned to me — null when
    // chatter tracking was unreadable (the caller's fallback date covers that).
    c.assignedDate = c.orders.map(o => o.assignedDate).filter(Boolean).sort().pop() || null;
  }
  return customers;
}

// ── The cross-check ──────────────────────────────────────────────────────────

// Month index for month-granularity comparisons — the forecast is monthly, so
// "received Jan 15, forecasted from Jan" is fine while "received June,
// forecasted from Jan" is not.
const monthIndex = d => d.getFullYear() * 12 + d.getMonth();

// odooAccounts: [{ id, so, partner, state, nextInvoiceDate, endDate, startDate,
//                  tags: [names], churnDate, assignedDate, monthly, currency,
//                  isFutureUser, isSalesperson }]
// dates are ISO strings or null.
export function crossCheck({ sheetRows, odooAccounts, year = new Date().getFullYear(),
                             fallbackHandoverDate = null, futureUserKnown = false }) {
  const customers = aggregateCustomers(odooAccounts);
  const handoverFallback = parseDateFlexible(fallbackHandoverDate);

  // Attach sheet rows to customers: exact SO-number join first, name join second.
  const customerBySo = new Map();
  for (const c of customers.values()) {
    for (const o of c.orders) if (o.so) customerBySo.set(String(o.so).trim().toUpperCase(), c);
  }
  const rowsByCustomer = new Map(); // customer key → rows
  for (const row of sheetRows) {
    const bySo = row.soNumber ? customerBySo.get(row.soNumber.toUpperCase()) : null;
    const c = bySo || customers.get(row.key) || null;
    row._customer = c;
    if (c) {
      if (!rowsByCustomer.has(c.key)) rowsByCustomer.set(c.key, []);
      rowsByCustomer.get(c.key).push(row);
    }
  }

  const unforecasted = [];        // A1 + A2
  const wronglyForecasted = [];   // B1 + B2 + B3
  const bookNotInSheet = [];      // forecasted onto me but missing from the sheet

  for (const c of customers.values()) {
    const rows = rowsByCustomer.get(c.key) || [];
    const rep = c.rep;
    const assignedReal = parseDateFlexible(c.assignedDate); // per-account chatter tracking
    const assigned = assignedReal || handoverFallback;

    // My forecasted book: future-user accounts when the field is known,
    // otherwise (no detectable field) my salesperson accounts stand in.
    const inMyBook = futureUserKnown ? c.isFutureUser : c.isSalesperson;

    if (!rows.length) {
      // A1 — I own a live subscription, I'm NOT the future user, and the
      // department sheet doesn't have the customer at all: nobody forecasted
      // it. Drafts, replaced (5_renewed) and churned customers don't qualify.
      const notForecastedOnMe = futureUserKnown ? !c.isFutureUser : true;
      if (c.isSalesperson && notForecastedOnMe && c.hasActive) {
        unforecasted.push({
          source: 'A1 not in sheet', account: c.name, so: rep.so,
          nextInvoiceDate: rep.nextInvoiceDate || null, monthly: rep.monthly,
          currency: rep.currency, state: rep.state, odooId: rep.id
        });
      }
      // An account forecasted ONTO me that the sheet is missing is an anomaly
      // of its own — the sheet is supposed to carry my whole book.
      if (futureUserKnown && c.isFutureUser) {
        bookNotInSheet.push({
          account: c.name, so: rep.so, state: rep.state,
          nextInvoiceDate: rep.nextInvoiceDate || null, odooId: rep.id
        });
      }
      continue;
    }

    // B checks apply only to MY book — a matched row for an account whose
    // future user is a colleague is THEIR forecast, not mine.
    if (!inMyBook) continue;

    for (const row of rows) {
      if (row.checkChurn === 1) continue; // handled as A2 below (sheet-driven)

      // B1 — customer churned in Odoo but the sheet still forecasts it
      if (c.churned) {
        const churnD = parseDateFlexible(c.churnDate);
        const beforeHandover = churnD && assigned && churnD < assigned;
        wronglyForecasted.push({
          reason: beforeHandover ? 'B1 churned before handover' : 'B1 churned in Odoo',
          account: row.accountName, so: rep.so, sheetRow: row.rowIndex,
          churnDate: c.churnDate || '', assignedDate: assigned ? isoDate(assigned) : '',
          state: rep.state, odooId: rep.id
        });
      }

      // B2 — churn tag anywhere on the customer's orders, Check Churn still 0
      const odooChurnTag = c.tags.find(t => CHURN_TAG_RE.test(t));
      if (odooChurnTag) {
        wronglyForecasted.push({
          reason: 'B2 churn tag in Odoo but sheet says 0',
          account: row.accountName, so: rep.so, sheetRow: row.rowIndex,
          tag: odooChurnTag, sheetTags: row.tags, odooId: rep.id
        });
      }

      // B3 — forecast starts in an earlier MONTH than I received the account
      // (the forecast is monthly, so same-month handovers are fine). Blank
      // transition means "forecasted the whole year" (from Jan); apply that
      // only with a real per-account tracking date — the global fallback date
      // would mass-flag every full-year row.
      const explicitTransition = parseDateFlexible(row.transitionDate);
      const transitionD = explicitTransition || (assignedReal ? new Date(year, 0, 1) : null);
      if (transitionD && assigned && monthIndex(assigned) > monthIndex(transitionD)) {
        wronglyForecasted.push({
          reason: 'B3 forecast starts before handover',
          account: row.accountName, so: rep.so, sheetRow: row.rowIndex,
          transitionDate: explicitTransition ? isoDate(explicitTransition) : `(blank = full ${year})`,
          assignedDate: isoDate(assigned), odooId: rep.id
        });
      }
    }
  }

  // A2 — MY sheet lines excluded by Check Churn = 1. The sheet holds the whole
  // department, so rows that match none of my accounts are colleagues' and are
  // skipped entirely.
  for (const row of sheetRows) {
    if (row.checkChurn !== 1 || !row._customer) continue;
    const c = row._customer;
    if (!(futureUserKnown ? c.isFutureUser : c.isSalesperson)) continue;
    const rep = c.rep;
    unforecasted.push({
      source: 'A2 check churn = 1', account: row.accountName, so: rep.so || row.soNumber,
      nextInvoiceDate: rep.nextInvoiceDate || null, monthly: rep.monthly ?? null,
      currency: rep.currency || '', sheetRow: row.rowIndex, sheetTags: row.tags,
      state: rep.state, odooId: rep.id
    });
  }

  const entryYear = u => { const d = parseDateFlexible(u.nextInvoiceDate); return d ? d.getFullYear() : null; };
  const yearFiltered = unforecasted.filter(u => entryYear(u) === year || entryYear(u) === null);
  const outsideYear = unforecasted.filter(u => entryYear(u) !== null && entryYear(u) !== year);

  const bookCustomers = [...customers.values()]
    .filter(c => (futureUserKnown ? c.isFutureUser : c.isSalesperson));

  return {
    year,
    futureUserKnown,
    unforecasted: yearFiltered,
    unforecastedOutsideYear: outsideYear,
    unforecastedGroups: groupByYQM(yearFiltered, u => parseDateFlexible(u.nextInvoiceDate)),
    wronglyForecasted,
    bookNotInSheet,
    totals: {
      odooAccounts: odooAccounts.length,
      odooCustomers: customers.size,
      bookCustomers: bookCustomers.length,
      bookMatchedInSheet: bookCustomers.filter(c => rowsByCustomer.has(c.key)).length,
      sheetRows: sheetRows.length,
      unforecasted: yearFiltered.length,
      wronglyForecasted: wronglyForecasted.length,
      bookNotInSheet: bookNotInSheet.length
    }
  };
}
