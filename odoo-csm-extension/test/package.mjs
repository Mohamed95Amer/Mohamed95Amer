// Build a distributable zip of the unpacked extension, excluding dev files.
// Usage: npm run package  ->  dist/odoo-csm-copilot-<version>.zip
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version;
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `odoo-csm-copilot-${version}.zip`);

const EXCLUDES = [
  'test/*', 'dist/*', 'node_modules/*', 'package.json', 'package-lock.json',
  'AUDIT.md', '.git/*', '.github/*', '.gitignore', '.DS_Store', '*/.DS_Store', '.claude/*'
];
const args = ['-r', out, '.', '-x', ...EXCLUDES];
execFileSync('zip', args, { cwd: root, stdio: 'inherit' });
console.log('\nPackaged → ' + out.replace(root + '/', ''));
