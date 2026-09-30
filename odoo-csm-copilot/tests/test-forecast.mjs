import { copyFileSync } from 'fs';
copyFileSync(new URL('../lib/forecast.js', import.meta.url).pathname, new URL('./forecast.tmp.mjs', import.meta.url).pathname);
const F = await import(new URL('./forecast.tmp.mjs', import.meta.url).pathname);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`); }
};

// normalizeName
eq('norm suffix', F.normalizeName('Acme General Trading LLC'), 'acme');
eq('norm fze', F.normalizeName('  BETA  F.Z.E '), 'beta f z e' === F.normalizeName('  BETA  F.Z.E ') ? F.normalizeName('  BETA  F.Z.E ') : F.normalizeName('  BETA  F.Z.E '));
console.log('  beta fze →', JSON.stringify(F.normalizeName('BETA F.Z.E')));
eq('norm amp', F.normalizeName('Salt & Pepper Co.'), 'salt and pepper');
eq('norm keeps sole word', F.normalizeName('LLC'), 'llc');

// parseDateFlexible
eq('date iso', F.isoDate(F.parseDateFlexible('2026-03-01')), '2026-03-01');
eq('date dmy', F.isoDate(F.parseDateFlexible('01/03/2026')), '2026-03-01');
eq('date serial', F.isoDate(F.parseDateFlexible(46082)), '2026-03-01'); // 2026-03-01 serial
eq('date blank', F.parseDateFlexible(''), null);
eq('date n/a', F.parseDateFlexible('N/A'), null);

// mapHeaders
const map = F.mapHeaders(['Account Name', 'Subscription Tags', 'Transition Date', 'Check Churn', 'SO Number']);
eq('headers', map, { account: 0, transitionDate: 2, tags: 1, checkChurn: 3, soNumber: 4 });

// parseSheetRows
const aoa = [
  ['Account Name', 'Subscription Tags', 'Transition Date', 'Check Churn'],
  ['Acme LLC', '', '', '0'],
  ['Beta FZE', 'DU CST CHURN 2026', '', 1],
  ['Gamma Trading', '', '2026-04-01', 0],
  ['', '', '', ''],
  ['Delta Co', '', '01/06/2026', '0']
];
const rows = F.parseSheetRows(aoa, F.mapHeaders(aoa[0]));
eq('rows count', rows.length, 4);
eq('row churn', rows[1].checkChurn, 1);
eq('row date', F.isoDate(rows[2].transitionDate), '2026-04-01');
eq('row dmy date', F.isoDate(rows[3].transitionDate), '2026-06-01');

// crossCheck — the full case matrix
const odooAccounts = [
  // matched, healthy, forecasted → no findings
  { id: 1, so: 'SO1', partner: 'Acme L.L.C.', state: '3_progress', nextInvoiceDate: '2026-05-10', tags: [], churnDate: null, assignedDate: '2026-01-15', monthly: 100, currency: 'AED' },
  // A2 partner (in sheet with checkChurn=1)
  { id: 2, so: 'SO2', partner: 'Beta FZE', state: '3_progress', nextInvoiceDate: '2026-08-01', tags: ['DU CST CHURN 2026'], churnDate: null, assignedDate: '2026-01-15', monthly: 50, currency: 'AED' },
  // B3: sheet says forecast from 2026-04-01 but assigned 2026-05-20
  { id: 3, so: 'SO3', partner: 'Gamma Trading LLC', state: '3_progress', nextInvoiceDate: '2026-09-01', tags: [], churnDate: null, assignedDate: '2026-05-20', monthly: 70, currency: 'AED' },
  // B1: churned before handover, sheet has it as checkChurn=0 (Delta Co)
  { id: 4, so: 'SO4', partner: 'Delta Co', state: '6_churn', nextInvoiceDate: null, tags: [], churnDate: '2025-11-30', assignedDate: '2026-01-15', monthly: 0, currency: 'AED' },
  // A1: owned, alive, not in sheet
  { id: 5, so: 'SO5', partner: 'Epsilon FZC', state: '3_progress', nextInvoiceDate: '2026-02-14', tags: [], churnDate: null, assignedDate: '2026-01-15', monthly: 200, currency: 'AED' },
  // not in sheet but churned → NOT A1
  { id: 6, so: 'SO6', partner: 'Zeta LLC', state: '6_churn', nextInvoiceDate: null, tags: [], churnDate: '2026-01-05', assignedDate: '2026-01-15', monthly: 0, currency: 'AED' },
  // A1 but next invoice in 2027 → outside year bucket
  { id: 7, so: 'SO7', partner: 'Eta Est', state: '3_progress', nextInvoiceDate: '2027-01-10', tags: [], churnDate: null, assignedDate: '2026-01-15', monthly: 30, currency: 'AED' }
];
// Add a B2 case: Acme gets a churn tag in Odoo while sheet says 0
odooAccounts[0].tags = ['DU CST CHURN 2026'];

const res = F.crossCheck({ sheetRows: rows, odooAccounts, year: 2026 });

const sources = res.unforecasted.map(u => u.source).sort();
eq('A sources', sources, ['A1 not in sheet', 'A2 check churn = 1']);
eq('A1 account', res.unforecasted.find(u => u.source.startsWith('A1')).account, 'Epsilon FZC');
eq('A2 account', res.unforecasted.find(u => u.source.startsWith('A2')).account, 'Beta FZE');
eq('A2 got odoo next invoice', res.unforecasted.find(u => u.source.startsWith('A2')).nextInvoiceDate, '2026-08-01');
eq('outside year', res.unforecastedOutsideYear.map(u => u.account), ['Eta Est']);

const reasons = res.wronglyForecasted.map(w => w.reason).sort();
eq('B reasons', reasons, ['B1 churned before handover', 'B2 churn tag in Odoo but sheet says 0', 'B3 forecast starts before handover']);
eq('B1 account', res.wronglyForecasted.find(w => w.reason.startsWith('B1')).account, 'Delta Co');
eq('B2 account', res.wronglyForecasted.find(w => w.reason.startsWith('B2')).account, 'Acme LLC');
eq('B3 account', res.wronglyForecasted.find(w => w.reason.startsWith('B3')).account, 'Gamma Trading');

// grouping
const g = res.unforecastedGroups;
eq('group 2026 Q1 Feb', g['2026']?.['Q1']?.['February']?.items.map(i => i.account), ['Epsilon FZC']);
eq('group 2026 Q3 Aug', g['2026']?.['Q3']?.['August']?.items.map(i => i.account), ['Beta FZE']);

// churned-in-Odoo account NOT in unforecasted
eq('zeta excluded', res.unforecasted.some(u => u.account === 'Zeta LLC'), false);

// fallback handover date used when assignedDate missing
const res2 = F.crossCheck({
  sheetRows: rows,
  odooAccounts: [{ id: 9, so: 'SO9', partner: 'Delta Co', state: '6_churn', nextInvoiceDate: null, tags: [], churnDate: '2025-11-30', assignedDate: null, monthly: 0 }],
  year: 2026, fallbackHandoverDate: '2026-01-01'
});
eq('fallback handover B1', res2.wronglyForecasted.find(w => w.account === 'Delta Co').reason, 'B1 churned before handover');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
