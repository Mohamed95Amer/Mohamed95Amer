// Forecast cross-check — pure logic, no chrome.* / DOM dependencies so it can
// be unit-tested in Node and reused from both the side panel and the worker.
//
// Inputs:
//   sheetRows    — parsed forecast sheet (accounts where the user is Future user)
//   odooAccounts — subscriptions where the user is the salesperson
//
// Outputs (all restricted to the target year):
//   A. unforecasted   — accounts that should be added to the forecast:
//        A1 owned in Odoo but missing from the sheet
//        A2 sheet lines with Check Churn = 1 (excluded by churn tag)
//      grouped by Year → Quarter → Month of next invoice date
//   B. wronglyForecasted — sheet lines with Check Churn = 0 that should not be:
//        B1 churned in Odoo (before handover when handover date is known)
//        B2 churn tag present in Odoo but sheet still says 0
//        B3 forecasted from a transition date earlier than the actual handover

export const CHURN_TAG_RE = /churn/i;

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
  if (v instanceof Date) return isNaN(v) ? null : v;
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
    const d = getDate(it);
    const year = d ? d.getFullYear() : 'No date';
    const quarter = d ? 'Q' + (Math.floor(d.getMonth() / 3) + 1) : '—';
    const month = d ? d.toLocaleString('en', { month: 'long' }) : '—';
    const monthNum = d ? d.getMonth() + 1 : 0;
    ((((groups[year] ??= {})[quarter] ??= {})[month] ??= { monthNum, items: [] })).items.push(it);
  }
  return groups;
}

// ── The cross-check ──────────────────────────────────────────────────────────

// odooAccounts: [{ id, so, partner, state, nextInvoiceDate, endDate, startDate,
//                  tags: [names], churnDate, assignedDate, monthly, currency }]
// dates are ISO strings or null.
export function crossCheck({ sheetRows, odooAccounts, year = new Date().getFullYear(), fallbackHandoverDate = null }) {
  const sheetByKey = new Map();
  for (const row of sheetRows) {
    if (!sheetByKey.has(row.key)) sheetByKey.set(row.key, []);
    sheetByKey.get(row.key).push(row);
  }

  const matchedSheetKeys = new Set();
  const unforecasted = [];        // A1 + A2
  const wronglyForecasted = [];   // B1 + B2 + B3
  const unmatchedOdoo = [];       // informational: Odoo accounts with no sheet row (superset of A1 incl. churned)
  const handoverFallback = parseDateFlexible(fallbackHandoverDate);

  for (const acc of odooAccounts) {
    const key = normalizeName(acc.partner);
    const rows = sheetByKey.get(key) || [];
    if (rows.length) rows.forEach(r => { matchedSheetKeys.add(r.key); r._odoo = acc; });

    const churned = /churn/i.test(acc.state || '') || !!acc.churnDate;
    const assigned = parseDateFlexible(acc.assignedDate) || handoverFallback;

    if (!rows.length) {
      unmatchedOdoo.push(acc);
      // A1 — I own it, it's alive, but nobody forecasted it
      // (year split happens below so off-year accounts stay visible)
      if (!churned) {
        unforecasted.push({
          source: 'A1 not in sheet', account: acc.partner, so: acc.so,
          nextInvoiceDate: acc.nextInvoiceDate || null, monthly: acc.monthly,
          currency: acc.currency, state: acc.state, odooId: acc.id
        });
      }
      continue;
    }

    for (const row of rows) {
      if (row.checkChurn === 1) continue; // handled as A2 below (sheet-driven)

      // B1 — churned in Odoo but the sheet still forecasts it
      if (churned) {
        const churnD = parseDateFlexible(acc.churnDate);
        const beforeHandover = churnD && assigned && churnD < assigned;
        wronglyForecasted.push({
          reason: beforeHandover ? 'B1 churned before handover' : 'B1 churned in Odoo',
          account: row.accountName, so: acc.so, sheetRow: row.rowIndex,
          churnDate: acc.churnDate || '', assignedDate: assigned ? isoDate(assigned) : '',
          state: acc.state, odooId: acc.id
        });
      }

      // B2 — churn tag in Odoo, Check Churn still 0
      const odooChurnTag = (acc.tags || []).find(t => CHURN_TAG_RE.test(t));
      if (odooChurnTag) {
        wronglyForecasted.push({
          reason: 'B2 churn tag in Odoo but sheet says 0',
          account: row.accountName, so: acc.so, sheetRow: row.rowIndex,
          tag: odooChurnTag, sheetTags: row.tags, odooId: acc.id
        });
      }

      // B3 — forecast starts before I actually received the account
      // (transitionDate may arrive as an ISO string after message serialization)
      const transitionD = parseDateFlexible(row.transitionDate);
      if (transitionD && assigned && assigned > transitionD) {
        wronglyForecasted.push({
          reason: 'B3 forecast starts before handover',
          account: row.accountName, so: acc.so, sheetRow: row.rowIndex,
          transitionDate: isoDate(transitionD), assignedDate: isoDate(assigned),
          odooId: acc.id
        });
      }
    }
  }

  // A2 — sheet lines excluded by Check Churn = 1
  const unmatchedSheet = [];
  for (const row of sheetRows) {
    if (row.checkChurn === 1) {
      const acc = row._odoo || null;
      unforecasted.push({
        source: 'A2 check churn = 1', account: row.accountName, so: acc?.so || row.soNumber,
        nextInvoiceDate: acc?.nextInvoiceDate || null, monthly: acc?.monthly ?? null,
        currency: acc?.currency || '', sheetRow: row.rowIndex, sheetTags: row.tags,
        odooId: acc?.id ?? null
      });
    }
    if (!row._odoo) unmatchedSheet.push(row);
  }

  const yearFiltered = unforecasted.filter(u => !u.nextInvoiceDate || String(u.nextInvoiceDate).startsWith(String(year)));
  const outsideYear = unforecasted.filter(u => u.nextInvoiceDate && !String(u.nextInvoiceDate).startsWith(String(year)));

  return {
    year,
    unforecasted: yearFiltered,
    unforecastedOutsideYear: outsideYear,
    unforecastedGroups: groupByYQM(yearFiltered, u => parseDateFlexible(u.nextInvoiceDate)),
    wronglyForecasted,
    unmatchedSheet: unmatchedSheet.map(r => ({ account: r.accountName, sheetRow: r.rowIndex, checkChurn: r.checkChurn })),
    totals: {
      odooAccounts: odooAccounts.length,
      sheetRows: sheetRows.length,
      unforecasted: yearFiltered.length,
      wronglyForecasted: wronglyForecasted.length,
      unmatchedSheet: unmatchedSheet.length
    }
  };
}
