# Majal validation evidence — 29 July 2026

## Safety boundary

- Live database: `erp`
- Clean validation database: `majal_ci_20260728`
- Capability clean validation database: `majal_capability_20260729`
- Final integrated validation database: `majal_full_20260729_2`
- Upgrade validation database: `majal_upgrade_20260729`
- Validation HTTP port: `8079`
- The source `erp` database was read only to create the upgrade snapshot.
- Its filestore was copied to a separately named clone.
- `majal_demo` was not installed on the cloned client database.

## Static validation

- Python syntax: passed for all Python files under `custom-addons`.
- XML parsing: 197 files passed.
- JavaScript syntax: 14 files passed.
- `git diff --check`: passed; Windows line-ending notices are informational.

## Clean installation

Command shape:

```text
odoo -c /tmp/odoo-ci.conf -d majal_ci_20260728
  -i majal_demo,majal_security,om_account_accountant
  --stop-after-init --http-port=8079
```

Result:

- 137 modules installed.
- Registry loaded and shut down normally.
- Retest after corrections contained no Odoo `ERROR`, `CRITICAL`, traceback,
  or failed-demo marker.

Corrections produced by log review:

- legacy construction approver demo passwords now satisfy the 12-character
  policy;
- secure asset tokens are made unique before PostgreSQL applies the unique
  constraint to a database that already contains maintenance equipment;
- obsolete `unaccent` field parameter removed;
- both new Arabic catalogs now include Odoo module metadata per entry.

## Automated tests

Full custom suite:

- final integrated clean run used disposable database
  `majal_full_20260729_2`;
- 482 tests;
- 0 failures;
- 0 errors;
- includes construction, facilities, BIM, AI, branding, administration,
  documents and offline modules.

Focused post-correction regression:

- `construction_base`: 5 tests;
- `facility_asset`: 13 tests;
- aggregate reported by Odoo: 14 post-tests;
- 0 failures and 0 errors.

The difference between per-module totals and Odoo's aggregate reflects its
installation/post-test accounting and is preserved here exactly as logged.

## Optional capability packs

Majal Administration now provides 12 controlled tiers across Procurement,
Inventory, Finance, Human Resources, Website and AI Administration.

Passed controls:

- strict explicit assignment; raw capability-field writes remain protected;
- one tier per capability family;
- minimum Majal role enforcement;
- Platform Owner approval for Finance Administrator, HR Administrator and
  Website Designer;
- Company Administrator assignment of approved lower tiers only;
- selected groups are added and unrelated capability groups are removed;
- all 12 catalog mappings were exercised;
- HR Officer no longer inherits upstream Maintenance Administrator;
- invite and change-access workflows both persist and audit the selected pack
  codes;
- capability catalog and assignment views loaded on clean install;
- Arabic capability translations loaded on the upgraded clone without an
  Odoo error marker.

Focused `majal_administration` result:

- 22 module tests;
- Odoo aggregate: 20 tests;
- 0 failures and 0 errors.

Interactive inspection was completed against the isolated upgraded clone:

- the Capability Catalog rendered all 12 capability tiers;
- Company Administrators were offered only Operations Manager and lower
  Majal roles;
- Field User / Technician was offered only Inventory User and Procurement
  User capability packs;
- Platform Owner-only and role-ineligible choices were absent from the
  client-admin dialogs;
- a clone-only Field User / Technician was created successfully with
  Facilities Management scope and Inventory User capability;
- the resulting user summary and Change Access dialog reflected the selected
  role, workspace and capability.

The visual pass exposed and corrected two defects before it passed:

- invite/access dialogs displayed choices that their server-side validation
  would reject;
- the invite flow attempted to clear a database-required transient password
  after creating the user.

The dialogs now use server-computed assignable role/capability domains, and the
password remains action-required but can be securely cleared after creation.
Both behaviours are covered by the focused regression suite.

## Facilities CRUD evidence protection

The latest review found that upstream Maintenance and several FM child models
allowed broad internal deletion. Majal now preserves technician operations
while keeping destructive actions manager-only:

- technicians may create and update assigned work orders, meter readings,
  floorplan pins, checklist tasks and planned parts;
- technicians cannot delete those operational records;
- technicians cannot create meter definitions or alter floorplan masters;
- equipment/facility managers retain explicit full CRUD where operationally
  required.

Focused Facilities result:

- `facility_asset`: 15 tests;
- `facility_floorplan`: 10 tests;
- `facility_inventory`: 20 tests;
- `facility_workorder`: 7 tests;
- Odoo aggregate: 44 tests, 0 failures, 0 errors.

An earlier integrated suite exposed a redirect loop in one branding test
because the generic test profile enabled database listing. Majal's selector
had already returned the correct 303 location. The test now verifies that
direct response without following unrelated downstream database-selection
policy; its focused suite, the 471-test intermediate rerun and the final
482-test integrated run all passed.

## Existing-database upgrade

The live database and filestore were copied to
`majal_upgrade_20260729`. All already-installed Construction, Facilities and
Majal modules were upgraded, and `majal_documents` plus
`majal_field_offline` were installed.

The initial run correctly failed on Arabic catalog metadata. The clone was
discarded, restored again from the untouched snapshot, and rerun after the
catalog correction.

Final result:

- all 137 dependency/installed modules loaded;
- Arabic translations for Documents and Field Offline loaded;
- registry initialized and shut down normally;
- no Odoo `ERROR`, `CRITICAL`, traceback, or failed-demo marker.

## Protected backup and restore drill

A real destructive restore was exercised only against the disposable
`majal_upgrade_20260729` database and its separately named filestore. The
backup root was isolated at
`/var/lib/odoo/majal_backups/drill_20260729`; the live `erp` database and its
normal backup slots were not targeted.

The first executor run exposed a real environment mismatch:

- application image PostgreSQL client: 18.4;
- database server: 16.14;
- the newer plain SQL dump included the server-unsupported session statement
  `SET transaction_timeout = 0;`.

The executor rolled back automatically, preserved the original clone and
filestore, removed the safety database, and wrote a failed receipt. Recovery
was hardened to:

- force a neutral `C` locale;
- take only the final non-empty scalar result line, so client warnings cannot
  contaminate authorization state;
- remove only the data-neutral `transaction_timeout` session declaration from
  the staged restore copy.

A new one-time request was then prepared and the same verified archive was
restored successfully. Post-restore evidence:

- both `erp` and `majal_upgrade_20260729` existed, with no
  `*_pre_restore_*` database left behind;
- the sentinel changed from `changed-after-backup` back to
  `included-in-backup`;
- 137 installed modules were present;
- the restored filestore contained 777 files;
- the request marker/running marker was removed;
- a `completed` protected receipt was written, reconciled and removed;
- immutable administration audit entry 20 recorded `restore_completed`.

Focused recovery regression after the correction:

- `majal_administration` reported 11 module tests;
- Odoo's aggregate result reported 9 tests;
- 0 failures and 0 errors;
- the new tests cover warning-safe scalar parsing and narrowly scoped dump
  compatibility sanitization.

## Browser and responsive acceptance

Live `erp` was used only for read-only visual checks of already-installed
features. The upgraded clone was served on a local-only loopback preview at
`127.0.0.1:8079`.

Passed:

- Majal app launcher shows Construction and Facilities.
- At 390 × 844, the app launcher has an internal `overflow-y: auto` container
  and accepted a real scroll event.
- Construction dashboard rendered its portfolio, Field Operations,
  Engineering, Commercial and Facilities workspaces; its main container
  scrolled from 0 to 701 pixels.
- Facilities dashboard rendered asset, work-order and PM information; its main
  container scrolled from 0 to 600 pixels.
- BIM rendered the four-element test model on the phone viewport.
- BIM Safe View switched to compatibility mode and preserved status colours,
  element navigation and linked-record details.
- On the upgraded clone, the app launcher showed the new original Majal Field
  and Majal Documents applications.
- Controlled Documents list and new-document editor loaded without browser
  console errors. The unsaved test form was discarded.
- Majal Field loaded at phone size, displayed its explicit safety boundary,
  switched between work-order and drawing workspaces, exposed the saved
  drawing action, and completed `Sync now` with `Field pack is up to date`.
- Majal Administration rendered its Capability Catalog and access dialogs
  against the isolated clone; all authorization-sensitive picker choices
  matched the server-side policy.
- Arabic was installed through the standard language installer on the clone.
  A clean-host Arabic session rendered the administration navigation, search,
  pager, table headings, all 12 capability names/families and their
  descriptions in RTL Arabic.
- The Administration Arabic catalog was regenerated from Odoo's current
  translation template and merged with the existing translations so the new
  action, menu, view, field, selection and translated-record references are
  explicit rather than relying on unattached generic PO entries.

Not completed:

- The test harness blocked navigation after the local preview server was
  intentionally stopped, so a genuine service-worker reload while the server
  was unavailable could not be observed in this run. This is a browser-harness
  policy limitation, not evidence that the offline reload passed or failed.
- Physical QR/NFC and remote-device WebGL remain device acceptance items.

## Gates still open

- genuine server-unavailable/service-worker and airplane-mode acceptance;
- physical QR and NFC acceptance;
- supported-hardware WebGL/BIM acceptance with a representative IFC;
- client-key AI provider acceptance and prompt-quality evaluation;
- PDF typography and client-template acceptance;
- external penetration, dependency/container and deployment security checks;
- off-machine encrypted backup and monitoring;
- licensing/legal and commercial operational deliverables.

Passing the automated gates does not by itself make the product production
approved.
