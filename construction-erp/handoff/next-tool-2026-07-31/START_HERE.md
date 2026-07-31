# Continue Majal — start here

This folder is the current handoff checkpoint for continuing Majal with
Codex, Claude Code, Cursor, or another development tool.

## 1. Project location

- Repository:
  `C:\Users\hossi\Documents\Odoo\construction-erp`
- Current branch:
  `codex/odoo19-ui-enhancement`
- Current committed checkpoint:
  `7eafa3c`
- Git remote:
  `https://github.com/Mohamed95Amer/Mohamed95Amer.git`
- Docker executable:
  `C:\Users\hossi\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`
- Cloudflare tunnel executable:
  `C:\tmp\cloudflared-windows-amd64.exe`

Run every Git and project command from:

```powershell
Set-Location -LiteralPath 'C:\Users\hossi\Documents\Odoo\construction-erp'
```

## 2. Protect the current work

The newest work is intentionally uncommitted. Do not run `git reset`,
`git clean`, `git checkout --`, or switch branches until the changes have
been reviewed and preserved.

Start with:

```powershell
git branch --show-current
git status --short
git diff --check
git diff --stat
```

Expected branch:

```text
codex/odoo19-ui-enhancement
```

The uncommitted changes include:

- Arabic navigation and missing Arabic interface text;
- corrected HSE wording: `الحوادث وشبه الحوادث`;
- right-to-left Programme Gantt layout with a left-to-right time axis;
- a populated Majal management dashboard landing page;
- client-facing Majal About and third-party licence pages;
- complete removal of the company-switcher UI on desktop and mobile;
- a safe material-issue fix that calculates site stock without granting
  ordinary construction users access to raw `stock.move` records;
- tests for the new dashboard and material access behaviour.

Do not discard any unrelated local modification. Review the complete
`git status --short` output before editing.

### Canonical branch and PR #6

Use `codex/odoo19-ui-enhancement` as the only continuation branch.

GitHub comparison on 31 July 2026 showed:

- `codex/odoo19-ui-enhancement` is 13 commits ahead of
  `claude/odoo-construction-facilities-i324s2`;
- it is one commit behind because Claude's final BIM Windows-fetch change has
  a different SHA;
- the Codex branch already contains the BIM functionality and the corrected
  PowerShell implementation, including the fix that does not rewrite tracked
  `SOURCES.md`.

Therefore:

- freeze `claude/odoo-construction-facilities-i324s2`;
- do not port new work or the PowerShell fix back to it;
- do not merge or force-update the Claude branch;
- leave draft PR #6 unchanged as historical context while the latest local
  Codex changes remain uncommitted;
- after the latest full suite passes and the user approves commit/push, open a
  replacement PR from the Codex branch to `main`;
- then close PR #6 with a short note that it is superseded by the replacement.

Do not close PR #6 or create the replacement PR without explicit user
approval.

## 3. Safety boundary

- Live local database: `erp`
- Live local URL when running: `http://127.0.0.1:8069`
- Isolated preview database: `majal_upgrade_20260729`
- Isolated preview container: `majal-clone-preview`
- Isolated preview URL when running: `http://127.0.0.1:8079`

Never install, upgrade, test destructive recovery, or experiment first on
`erp`. Use `majal_upgrade_20260729` or a newly created disposable database.

`majal_demo` is for demonstrations and automated acceptance only. Never
install it on a real client production database.

## 4. Start the isolated preview

Docker Desktop is currently stopped as of this checkpoint. Start Docker
Desktop first and wait until the engine reports that it is running.

Then use:

```powershell
$docker = 'C:\Users\hossi\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe'

& $docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
& $docker start construction-erp-db-1
& $docker start majal-clone-preview
& $docker ps --filter name=majal-clone-preview --format '{{.Status}} {{.Ports}}'
```

Expected preview mapping:

```text
127.0.0.1:8079->8069/tcp
```

Open:

```text
http://127.0.0.1:8079/web/login?db=majal_upgrade_20260729
```

Do not delete or recreate `majal-clone-preview` unless it is actually
missing. Its configuration already points to the isolated clone and its
separate filestore.

## 5. Preview accounts

General preview reviewer:

```text
Email: preview@majal.local
Password: MajalReview!2026
```

External friend reviewer:

```text
Email: friend.tester@majal.local
Password: MajalFriend!2026
```

The friend reviewer is an Operations Manager for Construction and Facilities
with these non-platform capabilities:

- Procurement Manager
- Inventory Manager
- Finance Accountant
- HR Officer
- Website Editor
- AI Administration

It intentionally does not have Platform Owner, database restore, backup
export, or hidden technical-system privileges.

Do not share Platform Owner credentials in prompts, screenshots, commits, or
public links.

## 6. Create a fresh temporary external test link

The previous `trycloudflare.com` link is expired because its tunnel process
is no longer running. Quick-tunnel URLs are temporary and change on restart.

After the isolated preview works locally, create a new link:

```powershell
$tunnel = 'C:\tmp\cloudflared-windows-amd64.exe'
$outLog = 'C:\tmp\majal-preview-tunnel.out.log'
$errLog = 'C:\tmp\majal-preview-tunnel.err.log'

$existingMajalTunnelIds = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -like 'cloudflared*' -and
        $_.CommandLine -like '*http://127.0.0.1:8079*'
    } |
    Select-Object -ExpandProperty ProcessId

if ($existingMajalTunnelIds) {
    Stop-Process -Id $existingMajalTunnelIds -Force
}

Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue

Start-Process `
    -FilePath $tunnel `
    -ArgumentList @(
        'tunnel',
        '--url', 'http://127.0.0.1:8079',
        '--no-autoupdate',
        '--protocol', 'quic',
        '--edge-ip-version', '4'
    ) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog

Start-Sleep -Seconds 8

$publicUrl = Select-String `
    -Path $outLog, $errLog `
    -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' `
    -AllMatches |
    ForEach-Object { $_.Matches.Value } |
    Select-Object -First 1

$publicUrl
```

Share this complete login path:

```text
<NEW_PUBLIC_URL>/web/login?db=majal_upgrade_20260729
```

Before sharing it, verify:

1. the public URL shows the Majal login page;
2. protected pages redirect to login;
3. the friend reviewer can open Majal Construction and Majal Facilities;
4. no company-switcher is visible;
5. the database manager remains disabled;
6. no source directory is exposed.

The PC, Docker Desktop, preview container, internet connection and
`cloudflared` process must remain running. This is a temporary review link,
not a production deployment.

## 7. Validation already completed

Earlier integrated checkpoint:

- 482 custom tests passed;
- 0 failures;
- 0 errors.

Latest focused regression after the Arabic/UI/material changes:

- 27 focused tests passed;
- 0 failures;
- 0 errors;
- included `construction_material` and `construction_ui`;
- used disposable database `majal_materialfix_20260729`.

Browser acceptance completed on the isolated preview:

- Majal management dashboard rendered with populated KPIs and navigation;
- Arabic construction navigation rendered;
- incident workspace used `الحوادث وشبه الحوادث`;
- Programme Gantt kept its timeline left-to-right inside the Arabic UI;
- a site user opened material issue `PRJ001-MI-0001` without the former
  `stock.move` access error;
- desktop and mobile company switchers were absent;
- external reviewer login succeeded through a Cloudflare quick tunnel;
- Construction, Facilities, Dashboard, Documents, Purchase, Inventory,
  Accounting, Maintenance, Employees, Website and Majal Intelligence apps
  were visible to the friend reviewer according to assigned permissions.

The latest changes still need one clean full-suite run before release.

## 8. Where work stopped

The most recent user request — hide company switching completely — was
implemented and visually verified. The earlier Arabic, Gantt, dashboard,
material-access, HSE terminology and client-facing About feedback was also
implemented on the isolated preview.

The live `erp` database was not upgraded with these latest changes. The latest
changes were not committed or pushed.

Recommended continuation order:

1. preserve and review the existing working tree;
2. start Docker and the isolated preview;
3. run static checks and the complete custom test suite on a disposable DB;
4. repeat English/Arabic desktop and 390 px mobile smoke tests;
5. test physical-device offline actions, QR/NFC and BIM/WebGL;
6. run an external security review and production deployment review;
7. update release documentation;
8. only with user approval, commit and push the reviewed changes.

## 9. Product/legal notes

- The product-facing name is Majal.
- The ordinary About page should describe Majal, not present the platform as
  Odoo.
- Odoo and other upstream components must remain listed on the dedicated
  third-party licence notice where their licences require attribution and
  corresponding-source information. Do not remove legally required notices.
- Hiding the company switcher is a UI decision only. Company record rules and
  server-side tenant isolation must remain active.

## 10. Read next

After this file, review:

- `CHECKPOINT.md`
- `COPY_THIS_PROMPT.txt`
- `TRANSFER_TO_ANOTHER_PC.md`
- `..\README.md`
- `..\STOPPED_HERE.md`
- `..\..\docs\validation-2026-07-29.md`
- `..\..\docs\full-system-audit-2026-07-28.md`
- `..\..\docs\documents-and-offline.md`
