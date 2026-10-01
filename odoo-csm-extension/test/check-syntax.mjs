// node --check over every .js in the extension. Catches a syntax error in a
// func: injected into executeScript BEFORE it fails silently at runtime in the
// Odoo tab — the most likely class of regression for this codebase.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'icons', 'test']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

let failed = 0;
for (const file of walk(root)) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log('OK  ' + file.replace(root + '/', ''));
  } catch (e) {
    failed++;
    console.log('ERR ' + file.replace(root + '/', '') + '\n' + (e.stderr?.toString() || e.message));
  }
}
console.log(failed ? `\n${failed} file(s) failed syntax check` : '\nAll files parse');
process.exit(failed ? 1 : 0);
