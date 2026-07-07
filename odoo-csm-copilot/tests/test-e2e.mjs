import { copyFileSync } from 'fs';
copyFileSync(new URL('../lib/forecast.js', import.meta.url).pathname, new URL('./forecast.tmp.mjs', import.meta.url).pathname);
const F = await import(new URL('./forecast.tmp.mjs', import.meta.url).pathname);
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require(new URL('../lib/vendor/xlsx.full.min.js', import.meta.url).pathname);

// 1. Build a realistic forecast sheet as a real xlsx (dates as Excel dates)
const aoaIn = [
  ['Customer Name', 'Subscription Tags', 'Transition Date', 'Check Churn', 'Notes'],
  ['Acme L.L.C', '', '', 0, 'x'],
  ['Beta F.Z.E', 'DU CST CHURN 2026', '', 1, ''],
  ['Gamma General Trading', '', new Date(2026, 3, 1), 0, ''],
  ['Delta Co', '', '', 0, ''],
  ['Orphan Account', '', '', 0, '']
];
const ws = XLSX.utils.aoa_to_sheet(aoaIn, { cellDates: true });
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Forecast 2026');
const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

// 2. Panel flow: read → AOA → map → rows → ISO-serialize → JSON round trip
const wb2 = XLSX.read(buf, { type: 'array', cellDates: true });
const aoa = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, raw: true, defval: '' });
const mapping = F.mapHeaders(aoa[0]);
console.log('mapping:', JSON.stringify(mapping));
if (mapping.account !== 0 || mapping.checkChurn !== 3) { console.log('FAIL mapping'); process.exit(1); }

let rows = F.parseSheetRows(aoa, mapping).map(r => ({ ...r, transitionDate: r.transitionDate ? F.isoDate(r.transitionDate) : null }));
rows = JSON.parse(JSON.stringify(rows)); // chrome.runtime.sendMessage serialization
console.log('rows:', rows.length, '| gamma transition:', rows[2].transitionDate);

// 3. Mock Odoo fetch result (as the service worker's in-page func returns it)
const odooAccounts = [
  { id: 1, so: 'S001', partner: 'ACME LLC', state: '3_progress', nextInvoiceDate: '2026-05-10', endDate: null, startDate: '2025-01-01', tags: [], churnDate: null, assignedDate: '2026-01-15', monthly: 500, currency: 'AED' },
  { id: 2, so: 'S002', partner: 'Beta FZE', state: '3_progress', nextInvoiceDate: '2026-08-01', endDate: null, startDate: '2025-01-01', tags: ['DU CST CHURN 2026'], churnDate: null, assignedDate: '2026-01-15', monthly: 300, currency: 'AED' },
  { id: 3, so: 'S003', partner: 'Gamma General Trading LLC', state: '3_progress', nextInvoiceDate: '2026-09-01', endDate: null, startDate: '2025-01-01', tags: [], churnDate: null, assignedDate: '2026-06-10', monthly: 700, currency: 'AED' },
  { id: 4, so: 'S004', partner: 'Delta Co', state: '6_churn', nextInvoiceDate: null, endDate: '2025-12-01', startDate: '2024-01-01', tags: [], churnDate: '2025-11-30', assignedDate: '2026-01-15', monthly: 0, currency: 'AED' },
  { id: 5, so: 'S005', partner: 'Epsilon Marine FZC', state: '3_progress', nextInvoiceDate: '2026-02-14', endDate: null, startDate: '2025-06-01', tags: [], churnDate: null, assignedDate: '2026-01-15', monthly: 200, currency: 'AED' }
];

const result = F.crossCheck({ sheetRows: rows, odooAccounts, year: 2026, fallbackHandoverDate: null });
console.log('\ntotals:', JSON.stringify(result.totals));
console.log('unforecasted:', result.unforecasted.map(u => `${u.source}: ${u.account}`));
console.log('wrong:', result.wronglyForecasted.map(w => `${w.reason}: ${w.account}`));

const ok =
  result.unforecasted.some(u => u.account === 'Epsilon Marine FZC' && u.source.startsWith('A1')) &&
  result.unforecasted.some(u => u.account === 'Beta F.Z.E' && u.source.startsWith('A2')) &&
  result.wronglyForecasted.some(w => w.account === 'Delta Co' && w.reason === 'B1 churned before handover') &&
  result.wronglyForecasted.some(w => w.account === 'Gamma General Trading' && w.reason === 'B3 forecast starts before handover') &&
  // 'Orphan Account' matches no Odoo record → another department's row, ignored
  result.totals.unforecasted === 2 && result.totals.wronglyForecasted === 2;

// 4. Export path (mirrors exportForecastExcel)
const unf = result.unforecasted.map(u => {
  const d = F.parseDateFlexible(u.nextInvoiceDate);
  return { Year: d ? d.getFullYear() : '', Quarter: d ? 'Q' + (Math.floor(d.getMonth() / 3) + 1) : '', Month: d ? d.toLocaleString('en', { month: 'long' }) : '', Account: u.account, Source: u.source };
});
const wbOut = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(unf), 'Unforecasted');
const outBuf = XLSX.write(wbOut, { type: 'array', bookType: 'xlsx' });
console.log('\nexport sheet rows:', XLSX.utils.sheet_to_json(XLSX.read(outBuf, { type: 'array' }).Sheets['Unforecasted']));

console.log(ok ? '\nE2E OK' : '\nE2E FAIL');
process.exit(ok ? 0 : 1);
