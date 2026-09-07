# Document intake and field-mapping — audit and proposal

Branch `codex/odoo19-ui-enhancement`, commit `f041df2`. Suite green at 728
tests, 0 failed, 0 errors.

---

## 0. The brief does not match this checkout

The brief describes `majal_document_intake` and its "current intake behavior"
as existing. **It does not exist on this branch.** Nor does anything
equivalent under another name.

| Brief says exists | Reality on this branch |
|---|---|
| `custom-addons/majal_document_intake` | Absent. No module matches intake/import/mapping/ocr. |
| `majal_document_intake/models/intake.py` | Absent. |
| `majal_document_intake/tests/test_intake.py` | Absent. |
| `majal_document_intake/views/` | Absent. |
| CSV/JSON/XLSX/PDF/DOCX/TXT parsing | Only XLSX, in one BOQ wizard. |
| PDF/DOCX text extraction | Nothing. No PDF or DOCX reader anywhere. |
| Automatic mapping, normalised labels, aliases | Nothing. |
| Mapping profiles (`source_key`, `target_field`, `required`, `default_value`) | No such model. |
| Parse → preview → apply | No preview step anywhere. |

`majal_documents` and `majal_sign` **do** exist and are substantial. The files
named under those two are all real. Everything attributed to intake is not.

**So this is not "extend safely" on this branch — it is a greenfield build.**
That changes the risk profile: there is no working behaviour to preserve, and
no migration burden, but equally nothing to lean on. If intake exists on
`codex/property-integration`, audit it there and compare; do not assume the
described behaviour is implemented anywhere until seen.

### The one real precedent

`construction_boq/wizard/boq_import.py` (128 lines) is the only file-parsing
code in the repo. Worth reading before writing a parser, because it already
gets two things right and three things wrong.

Right:
- `openpyxl.load_workbook(..., data_only=True)` reads cached values, so
  **formulas are never evaluated** — already compliant with "do not execute
  formulas".
- `read_only=True` streams rather than building the whole object graph.

Wrong, and these are the gaps to close:
- **No preview.** `action_import` parses and creates in one call. The brief's
  "parsed, previewed, and only then applied" does not exist even here.
- **No size limit.** `base64.b64decode(self.file)` materialises the entire
  upload in memory with no ceiling.
- **Rigid header contract.** `header[:7] != HEADERS[:7]` — exact match on
  seven lowercased labels, no aliases, no fuzzy matching, English only.

One thing that *looks* like a bug and is not: a `UserError` on row 50 leaves
rows 1–49 uncommitted, because Odoo wraps the RPC call in a single
transaction and the raise rolls it back. Atomicity is inherited from the
framework, not from the code. **Any future intake that commits in batches
loses that protection**, which matters directly for requirement 9
(background processing) — see §3.

---

## A. Existing and verified functionality

### `majal_documents` — the target model, and it is well guarded

`majal.document` (408 lines) already implements the exact field-class
distinction requirement 13 asks for. `write()` splits fields into two sets:

- **`transition_fields`** — `state`, `submitted_by_id`, `submitted_at`,
  `approved_by_id`, `approved_at`, `approval_checksum`, `issued_by_id`,
  `issued_at`, `current_version_id`. Writable only under `env.su` or with a
  context key compared **by object identity** against a private sentinel
  (`DOCUMENT_TRANSITION`). Unforgeable over RPC, because JSON cannot carry a
  Python object identity.
- **`controlled_content`** — `name`, `document_date`, `company_id`,
  `project_id`, `recipient_id`, `template_id`, `language`, `body_html`,
  `requires_qualified_signature`. Rejected once the record leaves
  `draft`/`rejected`.

**This is the allowlist. Do not invent a second one.** An intake mapper must
be denied `transition_fields` outright and permitted `controlled_content`
only while the document is in draft. Deriving the allowlist from these two
sets means the security model has one definition, not two that drift.

Also already satisfied, by the framework rather than by new code:
- **HTML escaping (safety rule).** `majal.document.body_html` is
  `fields.Html(sanitize=True)`, as is `majal.document.version.body_html` and
  the template body. Odoo sanitises on write — *provided intake writes through
  the ORM*. Writing via raw SQL would bypass it.
- **Company isolation.** `company_id` is required and indexed on the
  document, the version and the template.
- **Immutable history.** `majal.document.version` overrides `write()` to
  refuse and `unlink()` to refuse; it carries `checksum` and
  `attachment_id`. Requirement 7 (preserve the original upload) has a home
  already built.

### `majal_sign` — integration point exists

`majal.sign.request` (155 lines) binds a signature to `document_id` +
`version_id`, records `signed_by_id`, `signed_on`, `signed_checksum`, and
holds the signature as `fields.Image`. Requirement 14's eSign half is
reachable: an intake-created document flows into the existing
submit → approve → issue → sign chain without new plumbing.

Note for anyone writing tests against it: `fields.Image` pushes every write
through PIL, so arbitrary bytes raise `UnidentifiedImageError` before any
logic under test runs. That mistake was in the repo until today.

### `dms.file` — token checking already hardened

`check_access_token` uses `consteq` (constant-time) and refuses inherited
directory-token escalation unless an admin sets
`majal.documents.allow_directory_shares`. Uploaded-file sharing is not an
open door.

---

## B. Missing functionality

Everything in the brief's list of 14 is absent. Ranked by what actually
blocks the others:

| # | Requirement | Status | Blocks |
|---|---|---|---|
| 1 | OCR for scanned PDFs/images | Absent — no PDF reader at all | — |
| 2 | Semantic matching with confidence | Absent | 3 |
| 3 | Review screen (accept/edit/reject) | Absent — no preview anywhere | the whole safety story |
| 4 | Reusable mapping profiles | Absent | 5, 6 |
| 5 | Configurable targets from a safe allowlist | Absent | 13 |
| 6 | Per-document-type templates | Partially blocked — see below | — |
| 7 | Original preserved and attached | Absent, but `version.attachment_id` exists | 11, 12 |
| 8 | Duplicate detection | Absent — no checksum on upload | — |
| 9 | Background processing | Absent | atomicity, see §3 |
| 10 | Arabic + English extraction/aliases | Absent | 2 |
| 11 | Import audit trail | Absent | 12 |
| 12 | Safe rollback | Absent | — |
| 13 | Permission controls on mapping | Foundation exists (§A) | — |
| 14 | Documents/approvals/eSign integration | Reachable today | — |

### The finding that reframes requirement 6

The brief asks for mapping templates per document type and lists eleven.
`majal.document.template.document_type` offers eight:

`letter`, `contract`, `quotation`, `submittal`, `rfi`, `inspection`,
`handover`, `other`.

Cross-referencing the eleven requested:

| Requested | Exists as a `majal.document` type? | Reality |
|---|---|---|
| contract | Yes | — |
| quotation | Yes | — |
| submittal | Yes | — |
| RFI | Yes | (also a separate `construction.rfi` model) |
| inspection | Yes | (also `construction.form.inspection`) |
| handover | Yes | — |
| **BOQ** | No | `construction.boq` — its own model, own importer |
| **tender** | No | `construction_tender` — its own model |
| **invoice** | No | `account.move` — Odoo core, accounting |
| **property lease** | No | **No model exists at all** (see the property audit) |
| **facilities work order** | No | `maintenance.request` |

**Five of eleven cannot target `majal.document`.** They are first-class
models with their own workflows, approvals and accounting consequences. This
collides head-on with the brief's own safety rule *"do not allow arbitrary
model writes from user input"*: satisfying requirement 6 as literally written
means letting intake write into the BOQ, the tender register, the general
ledger and the maintenance backlog.

Three ways forward, in the order I would consider them:

1. **Scope intake to `majal.document` and `majal.sheet` only** (the brief's
   own stated current targets). The other five keep their own importers. BOQ
   already has one. Smallest surface, no new write paths into accounting.
2. **Per-target adapters**, each explicitly written, reviewed and permission-
   gated — never a generic "write any model" path. An adapter declares its own
   allowlist the way `majal.document.write()` already does. More work, but it
   is the only version that honestly delivers requirement 6.
3. **Intake produces a `majal.document` plus a proposed payload** that a human
   applies from inside the target model's own UI, so the target's existing
   guards run. Safest; slowest for the user.

**This is a product decision, not a technical one, and it is the first thing
to settle.** Everything about the permission model (5, 13) follows from it.
`account.move` in particular should not be an intake target without a finance
owner explicitly agreeing.

---

## C. Safe fixes implementable now

These need no product decision and no new dependency.

1. **Cap the upload size in `boq_import.py`.** `base64.b64decode` with no
   ceiling is a memory-exhaustion path reachable by any user who can open the
   wizard. A configurable limit via `ir.config_parameter`, defaulting to
   something sane, plus a `UserError` above it.
2. **Give the BOQ importer a preview.** Split `action_import` into
   parse-to-preview and apply. This is the smallest possible version of
   requirement 3, on code that exists, and it makes the pattern concrete
   before it is generalised.
3. **Locale-proof the UoM lookup.** `uoms = {u.name.lower(): u ...}` keys on
   `uom.uom.name`, which is translated — the same workbook resolves different
   UoMs depending on the user's language, silently. Match on a stable key.
4. **Checksum uploads on arrival.** `sha256` of the raw bytes, stored. It
   costs nothing now and is the precondition for requirements 8, 11 and 12.

None of these are the feature. They are the parts of the feature that are
already justified.

---

## D. Decisions needed before Phase 1

1. **Which models may intake write?** (§B). Blocks requirements 5, 6, 13.
2. **Does `account.move` come in scope?** Separate question, separate owner.
   Recommend no.
3. **Is an AI provider permitted at all, and by whom?** The brief already says
   never without explicit opt-in and credentials from environment only. The
   decision needed is *who* can enable it — per company, or platform owner
   only. Recommend platform owner, because the blast radius is confidential
   customer documents leaving the estate.
4. **Property lease templates are unbuildable.** There is no lease, tenancy,
   rent or occupancy model anywhere in this repo. A lease mapping template
   cannot exist before the domain does. Drop it from Phase 3 or accept that
   Phase 3 is blocked on the property architecture decision.
5. **OCR dependency policy.** Local OCR means Tesseract on the server; a
   vendored binary dependency is an install-path change that has broken CI on
   this branch before. Confirm it is acceptable in the Docker image before
   Phase 2 starts.

---

## Proposal, ordered

Adopting the brief's phases, with the corrections above.

### Phase 1 — deterministic, no AI, no OCR

- Settle decision D1 first. Everything below assumes targets are
  `majal.document` and `majal.sheet` only.
- New module `majal_document_intake`, depending on `majal_documents`.
- `majal.intake.upload`: the file, its `sha256`, filename, uploader,
  company, project, state (`uploaded` → `parsed` → `reviewed` → `applied` /
  `rejected`).
- Parsers for CSV, TXT, JSON, XLSX. **Not** PDF/DOCX yet — those are the
  cases where extraction quality decides the feature, and shipping them
  without OCR invites the "it installed, therefore it works" failure.
  XLSX reuses `data_only=True`, `read_only=True`.
- `majal.intake.mapping.profile` / `.line`, with `source_key`,
  `target_field`, `required`, `default_value`, validated against an
  allowlist **derived from `majal.document.write()`'s own field sets**, not
  a second hand-maintained list.
- Confidence per proposed mapping, from deterministic signals only: exact
  label match, normalised match, alias-table match, type compatibility. A
  number that means something, not a decorated guess.
- Review screen with detected field / proposed target / confidence /
  extracted value / accept-edit-reject.
- Apply in one transaction, writing through the ORM so `sanitize=True` and
  the guards run. Attach the original to the created
  `majal.document.version`.
- Duplicate detection on checksum first, then filename, then reference.
- `majal.intake.log`: uploader, checksum, profile, fields changed, records
  created, errors.
- Rollback = never having applied. Prefer refusing over undoing.

Tests, per the brief: malformed, oversized, Arabic, duplicate, invalid
mapping, permission failure, partial failure, rollback. Plus a browser pass —
the review screen is OWL, and on this branch four separate features have
installed perfectly while broken, every one of them invisible to the Python
suite.

### Phase 2 — OCR and optional AI

- Adapter interface first, with the deterministic parser as the default
  implementation and **no** provider wired.
- Local OCR provider behind the adapter; PDF and DOCX arrive here, not in
  Phase 1.
- Optional customer-supplied AI provider, off by default, credentials from
  environment only, per decision D3.
- Confidence from a provider must be visually distinguishable from
  deterministic confidence in the review screen. A reviewer needs to know
  which numbers came from a model.

### Phase 3 — templates, background processing

- Mapping templates only for document types that exist (§B). Lease is
  blocked on D4.
- Background processing via queue job. **Note the atomicity consequence:**
  today's all-or-nothing behaviour is inherited from Odoo's single
  transaction per RPC. A job that commits in batches loses it, so batching
  needs an explicit compensating design — an applied-records list on the log,
  and a real reversal path — before it is switched on. This is the one place
  where Phase 3 can quietly undo a Phase 1 safety property.

---

## Verifying

```bash
scripts/run-tests.sh all          # 728 tests, must stay 0/0
scripts/init-db.sh <db>           # CI-equivalent install, loads ar_001
scripts/run-local.sh -d <db> --http-port=8069
```

Run `init-db.sh`, not only the suite: the suite never loads a language, and a
malformed `.po` entry has taken the whole install down while the suite stayed
green. For anything with a UI, drive a browser — Playwright with
`executable_path=/opt/pw-browsers/chromium`, wait on `.o_main_navbar`, never
`networkidle`, and listen for `pageerror`.

Do not claim AI document mapping works until it has been run against real
sample files, including a scanned Arabic PDF, in a browser.
