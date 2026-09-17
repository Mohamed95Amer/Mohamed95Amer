// Load only this repository's isolated CLI stack. Never print or persist keys.
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function localRuntime() {
  if (!/^project_id = "getgold_validation"$/m.test(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'))) {
    throw new Error('Refusing to use a different local project');
  }
  const command = 'npx --yes supabase@2.117.0 status -o json';
  const raw = process.platform === 'win32'
    ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 })
    : execFileSync('npx', ['--yes', 'supabase@2.117.0', 'status', '-o', 'json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  const status = JSON.parse(raw);
  if (status.API_URL !== 'http://127.0.0.1:54321' || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error('Expected isolated loopback Supabase credentials');
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY_CURRENT: '',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    DIDIT_ENVIRONMENT: 'sandbox',
    VERCEL: '', VERCEL_ENV: '',
  };
}

if (require.main === module) {
  require('@next/env').loadEnvConfig(root);
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1'], {
    cwd: root, env: { ...process.env, ...localRuntime(), NODE_USE_SYSTEM_CA: '1' }, stdio: 'inherit', windowsHide: true,
  });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
module.exports = { localRuntime };
