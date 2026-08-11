# Majal Property — start here (2026-08-11)

This checkpoint supersedes `handoff/next-tool-2026-07-31/`. That one covers the
Construction and Facilities platform; this one covers the Property suite built
on top of it, and one unresolved defect that needs a browser to fix.

---

## Where everything is

| Thing | Location |
|---|---|
| Worktree | `C:\Users\hossi\Documents\Odoo-majal-property` |
| Branch | `feature/majal-property-phase2` |
| Remote | `github.com/Mohamed95Amer/Mohamed95Amer` (pushed, up to date) |
| Head commit | `86e5a60` |
| Platform baseline (pre-Property) | `0a021cb` = tip of `integration/majal-ui-workforce-test` |
| Other worktrees | `C:\Users\hossi\Documents\Odoo` (`wip/local-2026-07-31`), `C:\Users\hossi\Documents\Odoo-majal-integration-test` (`integration/majal-ui-workforce-test`) |
| Running demo | <http://localhost:8074> — login `admin`, password `admin` |
| Demo containers | `majal-prop-web`, `majal-prop-db` on network `majal-prop-net`, filestore volume `majal-demo-fs`, database `majal_demo` |

**Do not** touch `C:\Users\hossi\Documents\Odoo` or the `erp` database. Those
are the user's live working copy and live database.

The branch name says `phase2` and is now wrong — it contains five phases, a
platform integration, and five feature additions. Renaming it before opening a
PR is on the to-do list below.

---

## Commit history on this branch

Read newest first; each message explains its own reasoning.

| Commit | What |
|---|---|
| `86e5a60` | **Reverted** the UI shell split; held back `majal_property_ui` |
| `6c76ea5` | Fixed the Property app disappearing on a full-suite install |
| `1198237` | Cheques, service charges, owner statements, inspections, documents |
| `175d50b` | Split `construction_ui` into a shell — **later reverted by 86e5a60** |
| `f5d0704` | Connected Property to Construction and Facilities |
| `1176d72` | Handover, construction bridge, leasing |
| `10598c0` | Payment plans, commissions, leads, buyer portal |
| `7da5106` | Unit reservations |
| `fb083d7` | Development hierarchy and unit inventory (on `feature/majal-property-phase1`) |

---

## State in one paragraph

The Property application is complete and tested at the data and business-rule
level: 812 tests pass across 43 modules in one database, and it installs
correctly in four separate suite combinations. Its **custom web UI layer does
not work** — it renders a blank web client — and that layer is quarantined
(`majal_property_ui` is `installable: False`). Property currently appears as a
normal Odoo app with standard list and form views. Nothing else is broken.

---

## The one open defect

`majal_property_ui` renders a blank backend. The evidence, all of it:

* The server is healthy — login succeeds, `/odoo` returns 200, the ~6.4 MB
  `web.assets_web.min.js` bundle downloads with a 200.
* The bundle **contains** the module paths, the OWL template
  (`majal_property_ui.PropertyHome`), and the registry tag
  (`majal_property_ui.property_home`). Names are consistent; there are no stale
  `construction_ui.*` references left over.
* The browser fetches `/odoo`, fetches the JS, and then issues **no further
  requests at all** — no `load_menus`, no `call_kw`. That is a JavaScript
  exception during boot.
* It still blanked with `majal_property_ui` uninstalled, which is why the
  `construction_ui` → `majal_suite_ui` split was reverted rather than kept.

**Ruled out:** stale service worker/cache (reproduced on three fresh ports),
missing filestore, missing assets, missing template, dangling menu actions,
wrong template names, module load order.

**Not established:** which module throws, and what the exception is.

### Why it was not fixed

The previous tool had no browser. This environment also blocks installing one:
`apt-get` cannot fetch Google Chrome and `pip` cannot reach PyPI — both fail on
`CERTIFICATE_VERIFY_FAILED`, i.e. TLS interception. Ubuntu's `chromium` package
is a snap stub that will not run in a container. The Playwright image pulls
successfully but ships without the Python package, which then cannot be
installed for the same reason.

**If you have a browser, this is likely a ten-minute fix.** Open the demo,
press F12, reload, and read the first red console error. The suspect files are
only these:

```
custom-addons/majal_property_ui/static/src/workspace_hub/property_workspaces.js
custom-addons/majal_property_ui/static/src/home/property_home.js
custom-addons/majal_property_ui/static/src/home/property_home.xml
```

To re-enable it: set `"installable": True` in
`custom-addons/majal_property_ui/__manifest__.py` (the reason it was disabled is
written there), add `majal_property_ui` back to the `MODULES` line in
`scripts/run-tests.sh`, and reinstall.

**Note this trap before you uninstall it again:** `majal_property_ui` re-points
menus belonging to `majal_real_estate` and `majal_property_operations`. Odoo
does not restore overridden field values on uninstall, so uninstalling it
leaves four menus (Inventory, Sales, Handover, Leasing) pointing at deleted
client actions, and every page then returns 500. Clear them afterwards:

```sql
UPDATE ir_ui_menu SET action = NULL
WHERE action IS NOT NULL
  AND split_part(action, ',', 1) = 'ir.actions.client'
  AND NOT EXISTS (SELECT 1 FROM ir_act_client a
                  WHERE a.id = split_part(action, ',', 2)::int);
```

A proper fix is an `uninstall_hook` on that module doing the same thing.

---

## What to read next

1. `CHECKPOINT.md` in this folder — module map, verification recipe, house
   conventions, and the traps that cost the previous tool the most time.
2. `COPY_THIS_PROMPT.txt` — paste into the next tool to start it correctly.
3. `docs/full-system-audit-2026-07-28.md` — the platform audit that predates
   all Property work.
