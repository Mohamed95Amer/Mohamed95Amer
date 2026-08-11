# Majal Property — technical checkpoint (2026-08-11)

Read `START_HERE.md` first. This file is the detail: what exists, how to run
it, what the house conventions are, and which traps cost real time.

---

## 1. Module map

### New modules (all under `custom-addons/`)

| Module | Depends on | Purpose |
|---|---|---|
| `majal_real_estate` | `base`, `mail`, `portal` | The application. Development → community → building → floor → unit; unit types and a generation wizard; leads; reservations; payment plans and instalments; broker commissions; handover and snagging; cheques; documents with expiry; buyer portal. |
| `majal_property_operations` | `majal_real_estate` | Leasing: leases, rent schedules, renewals, tenant maintenance requests, move-in/move-out inspections, rent cheques. |
| `majal_property_ownership` | `majal_real_estate` | Service charge budgets and per-unit charges; owner statements and payouts. Picks up rent only if leasing is installed. |
| `majal_property_construction` | `majal_real_estate`, `construction_defect` | Bridge. Development ↔ `project.project`; taking-over date drives handover-linked instalments; punch items name a unit. |
| `majal_property_facilities` | `majal_property_operations`, `facility_asset`, `facility_workorder`, `facility_sla` | Bridge. Publishes units into the `facility.location` tree at handover; asset ↔ unit ↔ owner/occupant; tenant report → work order. |
| `majal_property_administration` | `majal_administration`, `majal_real_estate` | Bridge, `auto_install: True`. Fills the Property column of the shipped access levels. |
| `majal_property_ui` | `construction_ui`, `majal_real_estate`, `majal_property_operations` | **`installable: False`.** Workspaces, home page, My Day registers, menu restructure. Renders a blank web client — see `START_HERE.md`. |

### Existing modules modified

| Module | Change | Why |
|---|---|---|
| `majal_real_estate` | root menu `sequence` 36 → **38**, renamed "Majal Property", branded `icon.svg` | 36 clashed with Facilities, 37 is Odoo's Dashboards |
| `construction_ui` | `tests/test_icon_branding.py` allowlist | its own test failed the moment Property was installed alongside it |
| `facility_asset` | `models/facility_failure.py`: `maintenance.request.facility_location_id` from stored *related* to writable stored compute, plus `tests/test_request_location.py` | a request with no equipment could never hold a location, so every tenant-reported fault was invisible to location counts and record rules |
| `majal_administration` | scope sets + `real_estate_group_ids` m2m + a form page; `tenant_security.py` `FACILITY_ASSIGNMENT_MODELS` gained direct `facility_location_id.*` paths | `both` meant "the whole platform" and had to keep meaning it; FM rules routed only through equipment |
| `scripts/run-tests.sh` | Property modules added to the `all` list | they were never in the sweep |

---

## 2. How to run and verify

There is no bare-metal Odoo on this Windows machine. Everything runs in
disposable Docker stacks built from `construction-erp/Dockerfile`.

### Build the image once

```bash
cd /c/Users/hossi/Documents/Odoo-majal-property/construction-erp
docker build -t majal-prop-odoo -f Dockerfile .
```

### Full test suite (the canonical gate)

```bash
export MSYS_NO_PATHCONV=1                      # Git Bash mangles container paths without this
NEW=/c/Users/hossi/Documents/Odoo-majal-property/construction-erp
cd "$NEW"

docker network create majal-verify-net
docker run -d --name majal-verify-pg --network majal-verify-net \
  -e POSTGRES_USER=odoo -e POSTGRES_PASSWORD=odoo -e POSTGRES_DB=postgres postgres:16
sleep 8

MODS=$(sed -n 's/^    MODULES="\(.*\)"$/\1/p' scripts/run-tests.sh | head -1)
TAGS=$(echo "$MODS" | tr ',' '\n' | sed 's|^|/|' | paste -sd, -)

docker run --rm --network majal-verify-net \
  -e HOST=majal-verify-pg -e USER=odoo -e PASSWORD=odoo \
  -v "$NEW/custom-addons:/mnt/custom-addons:ro" \
  -v "$NEW/oca-addons:/mnt/oca-addons:ro" \
  -v "$NEW/third-party-addons:/mnt/third-party-addons:ro" \
  majal-prop-odoo odoo -d testdb -i "$MODS" \
  --db_host=majal-verify-pg --db_user=odoo --db_password=odoo \
  --addons-path=/mnt/custom-addons,/mnt/oca-addons,/mnt/third-party-addons,/usr/lib/python3/dist-packages/odoo/addons \
  --test-enable --test-tags "$TAGS" --stop-after-init --log-level=test
```

Expected: `0 failed, 0 error(s) of 812 tests`, 43 modules.
Tear down afterwards: `docker rm -f majal-verify-pg && docker network rm majal-verify-net`.

### Rebuild the demo

Same as above but on network `majal-prop-net` against `majal-prop-db`, database
`majal_demo`, **and mount the filestore volume in both the build container and
the serving container**:

```bash
-v majal-demo-fs:/var/lib/odoo
```

Then serve:

```bash
docker run -d --name majal-prop-web --network majal-prop-net -p 8074:8069 \
  -e HOST=majal-prop-db -e USER=odoo -e PASSWORD=odoo \
  -v majal-demo-fs:/var/lib/odoo \
  -v "$NEW/custom-addons:/mnt/custom-addons:ro" \
  -v "$NEW/oca-addons:/mnt/oca-addons:ro" \
  -v "$NEW/third-party-addons:/mnt/third-party-addons:ro" \
  majal-prop-odoo odoo -d majal_demo \
  --db_host=majal-prop-db --db_user=odoo --db_password=odoo \
  --addons-path=/mnt/custom-addons,/mnt/oca-addons,/mnt/third-party-addons,/usr/lib/python3/dist-packages/odoo/addons \
  --db-filter='^majal_demo$'
```

### Suite combinations (a customer buys one, two, or all three)

All four were verified. Re-run any of them by changing the `-i` list:

| Combination | `-i` modules | Result |
|---|---|---|
| Property only | `majal_property_ui,majal_property_operations,majal_property_ownership` | 138 tests; **0** construction and **0** facility modules installed |
| Construction + Property | `construction_ui,majal_property_construction,majal_property_ownership` | 125 tests |
| Property + Facilities | `majal_property_facilities,majal_property_ownership,facility_workorder,facility_sla` | 169 tests; **0** construction modules |
| Everything | the `all` list | 812 tests |

Assert the isolation, do not assume it:

```sql
SELECT count(*) FROM ir_module_module
WHERE name LIKE 'construction%' AND state = 'installed';
```

### Upgrade path (an existing customer)

Verified once and worth repeating after any structural change:

1. `git worktree add --detach <tmp> 0a021cb`
2. Build a database from that old code with the old `MODULES` list (130 modules).
3. Point the *new* code at the same database and run `-u all`.
4. Expect the new modules to install themselves as dependencies, no dangling
   menus, and the platform suite green.

Check for dangling menus after any uninstall or module move:

```sql
SELECT m.id, m.name->>'en_US', m.action FROM ir_ui_menu m
WHERE m.action IS NOT NULL
  AND split_part(m.action, ',', 1) = 'ir.actions.client'
  AND NOT EXISTS (SELECT 1 FROM ir_act_client a
                  WHERE a.id = split_part(m.action, ',', 2)::int);
```

---

## 3. Traps that cost the most time

1. **The filestore is half the system.** Building a database in one `--rm`
   container and serving it from another loses every attachment. The symptom is
   a login page that renders and a backend that 500s on `load_menus`, or a test
   suite with one inexplicable failure and a `FileNotFoundError`. Always share a
   named volume at `/var/lib/odoo`.
2. **`MSYS_NO_PATHCONV=1`** before any `docker run` with Unix-style container
   paths, or Git Bash rewrites them to `C:/Program Files/...`.
3. **`sed ... | head -1`** when parsing `MODULES` out of `run-tests.sh` — the
   file has a second `MODULES=` line in the `else` branch, and without `head -1`
   the module list silently gains a literal `$MOD` and one real module is never
   installed. This produced a false "all modules tested" result once.
4. **HTTP 200 proves nothing about a browser.** `curl` on `/web/login` cannot
   log in, cannot run JavaScript, and does not share the browser's cache. Four
   "verified" reports were wrong because of this.
5. **View inheritance may not select on `string`** in Odoo 18. Anchor xpaths on
   `name` attributes or field names.
6. **A stored `related` cannot be written independently**; if a field needs both
   a default source and manual override, make it a stored compute with
   `readonly=False` — and have the compute `continue` rather than assign `False`
   when the source is empty, or every recompute wipes manual values.
7. **Odoo does not restore overridden field values on uninstall.** See the
   dangling-menu SQL above.
8. **Test timezone boundaries.** `fields.Date.context_today` resolves per user;
   a test that creates records as admin and reads a screen as another user will
   fail for an hour each evening if it asserts on exactly today. Use dates a few
   days either side.

---

## 4. House conventions this code follows

* Bridges are separate modules named `majal_<a>_<b>`, `auto_install: False`,
  containing only models and views — no security, no data, no demo. Links are
  `Many2one` fields added by `_inherit` on **both** sides plus stored `related`
  mirrors. No link tables, no `res_model`/`res_id`.
* Each app has its own `ir.module.category`; `<app>_user` implies
  `base.group_user`, `<app>_manager` implies `<app>_user`. Sub-apps reuse the
  parent's category and imply the parent's user group. Two ACL rows per model.
* Own `ir.sequence` XML with `company_id eval="False"` and a `%(year)s` prefix.
  Do **not** inherit `construction.document.mixin` — it hard-requires a
  construction `project_id` and would break app independence.
* Tests: `@tagged("post_install", "-at_install")` on `TransactionCase`
  (`HttpCase` for portal), one file per feature slice, sentence-style names that
  state the rule rather than the method.
* Concurrency rules that matter go in the database, not only in Python — see
  the partial unique indexes in `majal.reservation`, `majal.handover` and
  `majal.lease` (`init()` methods).
* Demo data lives in each module's own `demo/`, not in `majal_demo`.

---

## 5. Decisions still open (for the user, not for a tool to assume)

1. **Accounting.** Every amount — buyer instalments, rent, commissions, service
   charges, owner payouts — is a number somebody types. No `account.move`, no
   journal entries, nothing reconciles. Owner statements compute what to pay a
   third party. This needs a decision before real money touches it.
2. **`majal_workforce` overlap.** It also owns `member_user_ids` on
   `facility.location` and rewrites it from allocations down the subtree, so on
   an install with both, an allocation change overwrites what
   `majal_property_facilities` stamps. Documented in
   `_stamp_facility_team`. Expressing the FM team as an allocation is the
   durable answer.
3. **Community → `zone`.** Assumed. If communities are separately-addressed
   sites, they should be `site` and the development becomes a pure grouping.
4. **`majal_demo`** has no Property content, so the enterprise demo seeder shows
   two populated apps and one empty one.
5. **Branch rename** and a PR; the shared-module edits (`construction_ui`,
   `facility_asset`, `majal_administration`) deserve a human reviewer because a
   defect there affects products already sold.
