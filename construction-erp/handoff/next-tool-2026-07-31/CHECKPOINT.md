# Majal checkpoint — 31 July 2026

## Source state

- Repository: `C:\Users\hossi\Documents\Odoo\construction-erp`
- Branch: `codex/odoo19-ui-enhancement`
- HEAD: `7eafa3c`
- Remote: `origin`
- Latest UI/Arabic fixes: local and uncommitted
- Docker Desktop at handoff time: stopped
- Temporary Cloudflare tunnel at handoff time: stopped

## Branch decision

- Canonical continuation: `codex/odoo19-ui-enhancement`
- Frozen legacy branch: `claude/odoo-construction-facilities-i324s2`
- Draft PR #6 remains open temporarily as historical context.
- No changes should be ported back to the Claude branch.
- The replacement PR should be opened from the Codex branch only after the
  latest local changes pass the full suite and the user approves publishing.
- Close PR #6 as superseded only after that replacement exists.

## Current modified areas

```text
custom-addons/construction_base/i18n/ar_001.po
custom-addons/construction_hse/i18n/ar_001.po
custom-addons/construction_material/models/material_issue.py
custom-addons/construction_material/tests/test_material.py
custom-addons/construction_material/views/material_issue_views.xml
custom-addons/construction_planning/i18n/ar_001.po
custom-addons/construction_planning/static/src/gantt/gantt.scss
custom-addons/construction_report/i18n/ar_001.po
custom-addons/construction_ui/__manifest__.py
custom-addons/construction_ui/i18n/ar_001.po
custom-addons/construction_ui/static/src/dashboard_hub/
custom-addons/construction_ui/static/src/workspace_hub/workspace_hub.js
custom-addons/construction_ui/tests/__init__.py
custom-addons/construction_ui/tests/test_dashboard_hub.py
custom-addons/construction_ui/views/app_icon_branding.xml
custom-addons/construction_ui/views/dashboard_hub_views.xml
custom-addons/majal_branding/__manifest__.py
custom-addons/majal_branding/controllers/legal.py
custom-addons/majal_branding/i18n/ar_001.po
custom-addons/majal_branding/static/src/company_switcher/
custom-addons/majal_branding/static/src/scss/backend.scss
custom-addons/majal_branding/static/src/user_menu/user_menu.js
custom-addons/majal_branding/views/legal_templates.xml
custom-addons/majal_branding/views/portal_templates.xml
custom-addons/majal_branding/views/res_config_settings_views.xml
custom-addons/majal_branding/views/web_templates.xml
```

Always trust a fresh `git status --short` over this snapshot.

## Functional checkpoint

### Company access

- Company switching is hidden on desktop and mobile.
- Desktop registry component is removed.
- Mobile burger-menu company component is removed.
- CSS provides a defensive fallback.
- Server-side company scope remains unchanged.

### Material issue

- The technical Stock Moves tab is limited to stock users.
- `qty_on_hand` computes with elevated read context so a construction user can
  view an aggregate site balance without receiving raw stock-move access.
- A regression test reads the issue and its line as a site user.

### Dashboard

- The root Dashboard app opens a Majal management hub.
- The hub provides populated management KPIs and links to executive,
  construction, facilities, commercial, personal and analytical views.
- The analytical workbook remains available as a child destination.

### Arabic and RTL

- Construction top navigation translations were completed for the reviewed
  actions.
- HSE uses `الحوادث وشبه الحوادث`.
- Programme Gantt deliberately keeps the time canvas left-to-right while
  names and controls use Arabic right-to-left layout.

### Branding and legal

- User menu uses `About Majal`.
- Product-facing About content describes Majal.
- Legal notice is labelled as third-party licences/notices.
- Upstream licence attribution remains present where legally necessary.

## Known release gates

Do not call this production-ready until these are complete:

- clean full-suite test after the latest UI batch;
- physical-device offline acceptance;
- representative QR and NFC hardware acceptance;
- remote BIM/WebGL acceptance on supported hardware;
- penetration/security review;
- deployment, monitoring, backup-retention and restore review;
- final legal and commercial review;
- durable hosting to replace temporary quick tunnels.
