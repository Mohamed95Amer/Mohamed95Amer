// Regression tests for the audit findings (F1–F3, F6, F8)
import { copyFileSync } from 'fs';
copyFileSync(new URL('../lib/forecast.js', import.meta.url).pathname, new URL('./forecast.tmp.mjs', import.meta.url).pathname);
const F = await import('./forecast.tmp.mjs?' + Date.now());

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
};

const mk = (over) => ({
  id: 1, so: 'S001', partner: 'Acme LLC', state: '3_progress', nextInvoiceDate: '2026-05-10',
  endDate: null, startDate: '2025-01-01', tags: [], churnDate: null,
  assignedDate: '2026-01-15', monthly: 100, currency: 'AED', ...over
});
const row = (over) => ({
  rowIndex: 2, accountName: 'Acme LLC', key: F.normalizeName('Acme LLC'),
  soNumber: '', transitionDate: null, tags: '', checkChurn: 0, ...over
});

// F1a — churned-then-renewed customer must NOT be flagged B1
{
  const res = F.crossCheck({
    sheetRows: [row({})],
    odooAccounts: [
      mk({ id: 1, so: 'S001', state: '6_churn', churnDate: '2025-06-01', nextInvoiceDate: null }),
      mk({ id: 2, so: 'S002', state: '3_progress', nextInvoiceDate: '2026-04-01' })
    ],
    year: 2026
  });
  eq('F1a no B1 for renewed customer', res.wronglyForecasted.length, 0);
}

// F1b — drafts / 5_renewed / upsell orders must not create A1 entries
{
  const res = F.crossCheck({
    sheetRows: [],
    odooAccounts: [
      mk({ id: 1, partner: 'DraftCo', state: '1_draft', nextInvoiceDate: null }),
      mk({ id: 2, partner: 'RenewedCo', state: '5_renewed', nextInvoiceDate: '2026-03-01' }),
      mk({ id: 3, partner: 'UpsellCo', state: '7_upsell', nextInvoiceDate: '2026-03-01' }),
      mk({ id: 4, partner: 'LiveCo', state: '3_progress', nextInvoiceDate: '2026-03-01' })
    ],
    year: 2026
  });
  eq('F1b only active customers in A1', res.unforecasted.map(u => u.account), ['LiveCo']);
}

// F1c — one customer with several orders emits ONE A1 entry from the active order
{
  const res = F.crossCheck({
    sheetRows: [],
    odooAccounts: [
      mk({ id: 1, so: 'S-OLD', partner: 'Multi LLC', state: '5_renewed', nextInvoiceDate: '2026-09-01', monthly: 1 }),
      mk({ id: 2, so: 'S-NEW', partner: 'Multi L.L.C.', state: '3_progress', nextInvoiceDate: '2026-02-01', monthly: 500 })
    ],
    year: 2026
  });
  eq('F1c single A1 entry', res.unforecasted.length, 1);
  eq('F1c representative is active order', [res.unforecasted[0].so, res.unforecasted[0].monthly], ['S-NEW', 500]);
}

// F1d — B2 emitted once per (customer, sheet row) even with two churn-tagged orders
{
  const res = F.crossCheck({
    sheetRows: [row({})],
    odooAccounts: [
      mk({ id: 1, so: 'S001', tags: ['DU CST CHURN 2026'] }),
      mk({ id: 2, so: 'S002', tags: ['DU CST CHURN 2026'], nextInvoiceDate: '2026-07-01' })
    ],
    year: 2026
  });
  eq('F1d B2 once', res.wronglyForecasted.filter(w => w.reason.startsWith('B2')).length, 1);
}

// F1e — A2 enrichment uses the ACTIVE order, not the churned/last one
{
  const res = F.crossCheck({
    sheetRows: [row({ checkChurn: 1 })],
    odooAccounts: [
      mk({ id: 1, so: 'S-DEAD', state: '6_churn', churnDate: '2025-06-01', nextInvoiceDate: null }),
      mk({ id: 2, so: 'S-LIVE', state: '3_progress', nextInvoiceDate: '2026-04-15' })
    ],
    year: 2026
  });
  const a2 = res.unforecasted.find(u => u.source.startsWith('A2'));
  eq('F1e A2 from active order', [a2.so, a2.nextInvoiceDate], ['S-LIVE', '2026-04-15']);
}

// F2 — reactivated order (state 3_progress but old churn log date) is NOT churned
{
  const res = F.crossCheck({
    sheetRows: [row({})],
    odooAccounts: [mk({ state: '3_progress', churnDate: '2025-04-01' })],
    year: 2026
  });
  eq('F2 reactivated not churned', res.wronglyForecasted.length, 0);
}

// F3a — blank transition + real tracking date after Jan 1 → B3 fires
{
  const res = F.crossCheck({
    sheetRows: [row({ transitionDate: null })],
    odooAccounts: [mk({ assignedDate: '2026-06-01' })],
    year: 2026
  });
  eq('F3a blank transition B3 with tracking', res.wronglyForecasted.map(w => w.reason), ['B3 forecast starts before handover']);
}

// F3b — blank transition + only the GLOBAL fallback date → no B3 (avoid mass flags)
{
  const res = F.crossCheck({
    sheetRows: [row({ transitionDate: null })],
    odooAccounts: [mk({ assignedDate: null })],
    year: 2026, fallbackHandoverDate: '2026-07-01'
  });
  eq('F3b blank transition no B3 with fallback', res.wronglyForecasted.length, 0);
}

// F3c — explicit transition + fallback date still fires B3
{
  const res = F.crossCheck({
    sheetRows: [row({ transitionDate: '2026-03-01' })],
    odooAccounts: [mk({ assignedDate: null })],
    year: 2026, fallbackHandoverDate: '2026-07-01'
  });
  eq('F3c explicit transition B3 with fallback', res.wronglyForecasted.map(w => w.reason), ['B3 forecast starts before handover']);
}

// F3d — blank transition, tracking says he had it since before the year → no B3
{
  const res = F.crossCheck({
    sheetRows: [row({ transitionDate: null })],
    odooAccounts: [mk({ assignedDate: '2024-05-01' })],
    year: 2026
  });
  eq('F3d long-held account no B3', res.wronglyForecasted.length, 0);
}

// F6 — UTC-midnight Date (SheetJS cellDates) parses to the UTC calendar day
{
  const d = F.parseDateFlexible(new Date('2026-06-01T00:00:00Z'));
  eq('F6 UTC-midnight date', F.isoDate(d), '2026-06-01');
  const dLocal = F.parseDateFlexible(new Date(2026, 5, 1, 14, 30));
  eq('F6 local afternoon date unchanged', F.isoDate(dLocal), '2026-06-01');
}

// F8a — SO-number join beats a name mismatch
{
  const res = F.crossCheck({
    sheetRows: [row({ accountName: 'Totally Different Name', key: F.normalizeName('Totally Different Name'), soNumber: 's001', checkChurn: 0 })],
    odooAccounts: [mk({ so: 'S001', state: '6_churn', churnDate: '2025-06-01', nextInvoiceDate: null, assignedDate: '2026-01-15' })],
    year: 2026
  });
  eq('F8a B1 via SO join', res.wronglyForecasted.map(w => w.reason), ['B1 churned before handover']);
}

// F8b — sheet rows that match none of my accounts belong to other departments
// and are IGNORED (not A2, not reported anywhere)
{
  const res = F.crossCheck({
    sheetRows: [row({ accountName: 'GhostCo', key: F.normalizeName('GhostCo'), checkChurn: 1 })],
    odooAccounts: [mk({})],
    year: 2026
  });
  eq('F8b colleague rows ignored', res.unforecasted.filter(u => u.source.startsWith('A2')).length, 0);
}

// ── Role-aware direction (future-user book) ──────────────────────────────────

// R1 — future-user account missing from the sheet → bookNotInSheet, not A1
{
  const res = F.crossCheck({
    sheetRows: [],
    odooAccounts: [mk({ partner: 'MyBookCo', isFutureUser: true, isSalesperson: false })],
    year: 2026, futureUserKnown: true
  });
  eq('R1 book not in sheet', res.bookNotInSheet.map(b => b.account), ['MyBookCo']);
  eq('R1 not A1', res.unforecasted.length, 0);
}

// R2 — salesperson-only active account not in sheet → A1
{
  const res = F.crossCheck({
    sheetRows: [],
    odooAccounts: [mk({ partner: 'SalesOnlyCo', isFutureUser: false, isSalesperson: true })],
    year: 2026, futureUserKnown: true
  });
  eq('R2 A1 for sales-only', res.unforecasted.map(u => u.source), ['A1 not in sheet']);
  eq('R2 no book anomaly', res.bookNotInSheet.length, 0);
}

// R3 — salesperson-only account matched to a sheet row (colleague's forecast)
// → NO B checks even if churned
{
  const res = F.crossCheck({
    sheetRows: [row({})],
    odooAccounts: [mk({ state: '6_churn', churnDate: '2025-06-01', nextInvoiceDate: null, isFutureUser: false, isSalesperson: true })],
    year: 2026, futureUserKnown: true
  });
  eq('R3 no B for colleague forecast', res.wronglyForecasted.length, 0);
}

// R4 — future-user account matched with churn tag + Check Churn 0 → B2
{
  const res = F.crossCheck({
    sheetRows: [row({})],
    odooAccounts: [mk({ tags: ['DU CST CHURN 2026'], isFutureUser: true, isSalesperson: false })],
    year: 2026, futureUserKnown: true
  });
  eq('R4 B2 on my book', res.wronglyForecasted.map(w => w.reason), ['B2 churn tag in Odoo but sheet says 0']);
}

// R5 — A2 (Check Churn=1) counted only for MY book, not colleague accounts
{
  const res = F.crossCheck({
    sheetRows: [
      row({ checkChurn: 1 }),
      row({ rowIndex: 3, accountName: 'TheirCo', key: F.normalizeName('TheirCo'), checkChurn: 1 })
    ],
    odooAccounts: [
      mk({ isFutureUser: true, isSalesperson: false }),
      mk({ id: 9, so: 'S009', partner: 'TheirCo', isFutureUser: false, isSalesperson: true, nextInvoiceDate: '2026-06-01' })
    ],
    year: 2026, futureUserKnown: true
  });
  eq('R5 A2 only my book', res.unforecasted.filter(u => u.source.startsWith('A2')).map(u => u.account), ['Acme LLC']);
}

// R6 — B3 month granularity: received Jan 15, forecasted from Jan → OK;
// received June, forecasted from Jan (blank) → flagged
{
  const ok = F.crossCheck({
    sheetRows: [row({})], odooAccounts: [mk({ assignedDate: '2026-01-15', isFutureUser: true })],
    year: 2026, futureUserKnown: true
  });
  eq('R6 same month no B3', ok.wronglyForecasted.length, 0);
  const bad = F.crossCheck({
    sheetRows: [row({})], odooAccounts: [mk({ assignedDate: '2026-06-10', isFutureUser: true })],
    year: 2026, futureUserKnown: true
  });
  eq('R6 later month B3', bad.wronglyForecasted.map(w => w.reason), ['B3 forecast starts before handover']);
}

// Year filter now uses parsed year, off-year A1 goes to outside bucket
{
  const res = F.crossCheck({
    sheetRows: [],
    odooAccounts: [mk({ partner: 'NextYearCo', nextInvoiceDate: '2027-01-10' })],
    year: 2026
  });
  eq('year split outside', res.unforecastedOutsideYear.map(u => u.account), ['NextYearCo']);
  eq('year split in-year empty', res.unforecasted.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
