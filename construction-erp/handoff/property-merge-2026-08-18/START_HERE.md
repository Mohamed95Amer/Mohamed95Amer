# Majal — checkpoint 2026-08-18: Property merged, both suites bilingual

Branch: `codex/odoo19-ui-enhancement` · head `42d491d` · draft PR #7 (open)

Suite: **1044 tests, 0 failed, 0 errors** (`scripts/run-tests.sh all`)
CI on the head commit: all checks green.

Do not reset, clean or discard the worktree. Run `git status --short` and
`git log -1 --oneline` before anything else.

---

## What changed since `705507c`

**Property was merged in** (`347cc79`). It was never on this branch. The
branch name people quote — `codex/property-integration` — does not exist on
the remote, and neither do commits `c1abd26` or `eb36396`. The real work is
on `codex/property-visual-staging-20260813`; that is what was merged. Ten
modules, 184 files, 49 model files, 32 test files.

Five conflicts, all resolved as unions rather than by picking a side. The two
that mattered were the module lists in `scripts/run-tests.sh` and
`scripts/init-db.sh`: each branch carried modules the other had never seen —
six here, twelve there — so taking either list wholesale would have silently
stopped testing or installing half the suite **while still reporting a pass**.

Then six fixes, in order:

| commit | what |
|---|---|
| `e5625ce` | infrastructure scripts made shellcheck-clean (the property branch brought its own CI job) |
| `94cf40e` | the Prometheus alert-rule step never actually ran promtool — wrong entrypoint |
| `fc75e02` | **workspace scope isolation**: allow-lists, not deny-lists |
| `f4c2478`, `0ded104` | Arabic for all ten Property modules |
| `e2a0caa` | Property workspace strings made visible to the extractor |
| `42d491d` | the same for `construction_ui` — the larger half |

---

## The two findings worth understanding before you touch anything

### 1. The scope enum grew and the rules did not (`fc75e02`)

`majal_industry_scope` gained `real_estate` and `property_facilities` in the
merge. Every tenant rule tested **one literal string** — construction models
excluded `'facilities'` and nothing else, facility models excluded
`'construction'` and nothing else. Both new values fell through every
exclusion, so a user whose workspace access read "Property" could read the
whole construction register and the whole facilities register.

Nobody wrote a bug. One branch added values to a selection; another owns the
rules that switch on it. **That is the class of fault a merge exists to
surface, and no test on either branch could see it.**

The gates are allow-lists now (`CONSTRUCTION_SCOPES`, `FACILITY_SCOPES`,
`PROPERTY_SCOPES` in `majal_administration/models/tenant_security.py`). A
scope value the code has never heard of now reads nothing. If you add a
workspace kind, add it to the right list or it grants nothing — which is the
correct default, and there is a test asserting exactly that.

### 2. A complete catalogue is not a translated screen (`e2a0caa`, `42d491d`)

`localizeConfig()` in `construction_ui/static/src/workspace_hub/workspace_hub.js`
calls `_t()` on `title`, `eyebrow`, `description`, `workflow`, `label` and
`hint` at runtime, for **every** suite. What it cannot do is put those strings
in the catalogue: Odoo's extractor only sees a literal **inside** a `_t()`
call. A bare literal is asked for at runtime and never found.

So the Property `.po` was 100% filled and the workspace was still English —
"Unit Inventory" had reached the catalogue as a *model* entry (the client
action's name, which the server translates) and never as a *web* one, which
is what `_t()` reads. Same on the construction side: 422 bare strings, 222 of
which rendered Arabic only because the identical English existed as a code
entry from some template elsewhere. The web catalogue is global, so that is
luck rather than coverage.

Both are wrapped now. **If you add a workspace, a metric or a workflow step,
wrap the literal in `_t()` at the point of definition** or it will never be
translatable, and nothing will tell you.

---

## Traps that cost time in this session

- **`_t()` at module level returns a `LazyTranslatedString`.** It extends
  `String` and renders fine on its own, but `typeof` reports `"object"`. Both
  config walkers took it for a node, ran `Object.entries` over it and rebuilt
  it as a map of character indices — `[object Object]` in the breadcrumb, 18
  times on one screen, **with the entire suite green**. Both walkers now check
  `value instanceof String` before the object branch. Do not remove that.
- **Do not wrap every two-element string array.** `["open", "reopened"]`,
  `["high", "critical"]` are stored selection values inside domains;
  translating one changes the query, not the wording. Scope any such transform
  to `workflow:` blocks.
- **A brace-balance check on this codebase lies.** It reports the same
  imbalance on the untouched original, because it does not understand the
  regex literal on line 10 of `workspace_hub.js`. Verify a mechanical edit by
  **inverting** it and comparing to the original instead.
- **`exists()` bypasses record rules.** Use `search()` or a field read to test
  readability.
- **Odoo's cache lives on the transaction, not the environment.** Call
  `env.invalidate_all()` before reading as another user, or a value cached by
  the superuser is served without any rule check. This made tests pass against
  unfixed code twice.
- **`post_init_hook` fires on install only.** For an already-installed module
  use `migrations/<version>/post-migrate.py` and bump the manifest version.
- **Postgres in the container dies often.** `pg_ctlcluster 16 main start`
  prints a misleading failure and then comes up; poll `pg_isready`.

---

## How the work was verified, and how to keep verifying it

A green suite proves nothing about the UI, and **admin proves nothing about
anyone else** — the superuser is exempt from record rules. Every real defect
found on this branch survived because it was only ever opened as admin.

- Personas: create users holding exactly one role, plus a **control account
  holding none**. A screen that opens for the control is a leak; a screen that
  refuses a role that needs it is a broken feature. Both are silent.
- Resolve action ids from `ir_model_data` at run time. Never hard-code them —
  a wrong id reads exactly like a permissions failure, and that mistake
  produced five false findings here.
- Assert the probe's own premise. Five harness bugs in this session; a broken
  probe and a broken product look identical from outside.
- Measure Arabic by loading the screen and counting Latin words, not by
  counting `.po` entries.

Property audit result: 43 actions, 71 screen-opens, **no leaks**, every menu a
persona is offered also opens. Property workspace: 0 Latin words. Construction
workspace: 18 Latin words, all of them demo *record* content ("Pile cap lap
lengths"), which is data and should stay as written.

---

## Open work, ranked

1. **The Property assets are still publicly served.** No `_headers` or
   `.cfignore`, so Cloudflare publishes the whole `website/` tree —
   `/assets/video/majal-property-walkthrough.soundtrack-v2.mp4` and three
   `property-*-concept.png` stills are fetchable at guessable URLs although
   nothing links to them. Unlinked is not private. Move them out of the
   publish root if the concept material should not be public.
2. **The 235 "empty list" menus from the persona sweep were never triaged.**
   Most are legitimately empty in a demo database; nobody has proved none of
   them is a broken domain.
3. **PR #7 is ~300 commits and ~3,400 files** and has never been reviewed as a
   whole. This is a release-process decision, not a technical one.

## Decisions that are the owner's, not the next tool's

- Should Majal **ship a starter approval rule set**? The rules in the tree are
  demo-only, so a fresh install requires no approvals until someone writes
  them. Defensible, but it should be deliberate.
- Should commercial users (QSs) **read the general ledger**? The Financial
  board is gated to accounting groups because the MIS report queries
  `account.move.line` without sudo, which is right. Widening it is an ACL
  grant, not a menu edit.
- The **document-intake target models** — 5 of 11 templates have no model to
  point at.
- **OCR** (does it justify a Tesseract dependency) and **who may enable an AI
  provider** against confidential documents.

## Standing constraints

- Secrets come from environment variables. Never hardcode, never commit one.
- Website content rules (`website/README.md`): no invented statistics, no
  invented social proof, no pricing, every number verifiable in the repo.
  Screenshots must be real captures — remove the `<figure>` rather than
  substitute a mock-up.
- Do not add a proprietary-licensed module without the owner deciding.
- Workflow guards compare context against a private sentinel **by identity**,
  never for truthiness.
- The product brand is Majal, not Odoo.
- Never merge `wip/local-2026-07-31`.
