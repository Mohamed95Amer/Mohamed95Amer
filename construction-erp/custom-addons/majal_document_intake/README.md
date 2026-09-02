# Majal Document Intake

Read a file, review what Majal thinks it says, then create the record.

## What it does

Upload CSV, TXT, JSON, XLSX, DOCX or a text-layer PDF. The file is parsed
locally, each column is matched against the fields an import is allowed to
write, and the proposal is shown on screen — detected column, proposed field,
confidence, the actual value from the file, and accept / edit / reject — before
anything is created.

## What it deliberately does not do

**It writes to `majal.document`, `majal.sheet` and `construction.form.template`,
and nothing else.** The BOQ, the tender register, the general ledger and the
maintenance backlog are first-class models with their own workflows and their
own approvals. Reaching into them from here would be an arbitrary-model write
by another name, so `construction.boq` keeps its own importer and
`account.move` is not a target.

All three targets go through the same `_intake_writable_fields()` gate,
though what it names differs. For `majal.document` and `majal.sheet` it is the
set of field names an import may write. For `construction.form.template` the
review line's target is not a field name at all — it is the question's answer
type — so the gate names the values `answer_type` accepts, read off that
Selection rather than restated.

Reasoning that the form path needed no gate because its user input lands in a
*value* position rather than a field name was wrong twice over, and both ways
were reproducible. The onchange behind that cell asked the target model for
its writable set regardless, so correcting a mis-detected answer type — the
most ordinary edit on the review screen — raised `AttributeError`. And an
answer type invented over RPC reached `create()` unchecked and surfaced as a
raw ORM `ValueError` about a Selection value, from inside the write it was
supposed to prevent. A value position is still user input.

Widening the set of targets is a product decision, not a configuration
change.

**No OCR.** A scanned PDF has no text layer, and the parser says so rather
than returning an empty table that looks like a successful read with no data
in it.

**No AI, no network.** Every match is a deterministic local rule: exact label,
known alias, folded spelling, or partial containment. Confidence names which
rule fired — it is not a probability, and the screen says so, because a number
that looks like a probability invites people to trust it instead of reading the
value printed beside it.

## The allowlist

`majal.document` and `majal.sheet` each expose `_intake_writable_fields()`,
derived from the same field sets their own `write()` uses to decide what may be
written; `construction.form.template` exposes it too, derived from the
`answer_type` Selection. There is no second list. A new controlled field
becomes importable automatically; a new workflow field becomes forbidden
automatically. The alternative — a hand-maintained copy — is the one that grants write access to a
workflow field the day somebody forgets to update it.

It is enforced in three places, because one is not enough:

1. an onchange, so the user finds out immediately;
2. a `@api.constrains` on the mapping profile, because a profile is ordinary
   data and any user who reaches the form can set a target field to anything;
3. a check in `action_apply`, because a decision arriving over RPC has not
   been through the review screen at all.

## Handling untrusted files

- Formulas are never evaluated — `openpyxl` reads with `data_only=True`.
- Values starting `=`, `+`, `-` or `@` are prefixed with an apostrophe, so a
  payload that is inert in Odoo stays inert when somebody exports the record
  and opens it in Excel.
- Zip containers (XLSX, DOCX) are refused if they expand beyond a ceiling or
  beyond a ratio. Either check alone is escapable.
- Format comes from sniffing the leading bytes. An extension is a claim.
- The stored original goes through `ir.attachment._check_contents`, which
  forces html-like content to `text/plain` for users without view-write rights.
- No macro, embedded object, external link or relationship target is read.

## Rollback

There isn't one, on purpose. Applying happens once, from data the user has
already corrected on screen, and a rejected upload creates nothing. Undoing an
import would mean deleting a record that may already be submitted, approved,
referenced or signed — and a feature that quietly removes an approved document
is worse than one that made the user look at a preview first.

## Duplicates

Detected on SHA-256 of the received bytes, against uploads that were actually
applied. Filename is recorded but never decides: a filename gets reused for a
corrected file, and treating that as a repeat would block the correction.

## Extending it

New format: add a parser to `models/parsers.py` and register it in `PARSERS`.
Nothing else changes — mapping, confidence and record creation all read rows of
strings and do not care where they came from.

New alias: add it to `ALIASES` in `models/mapping.py`, in both languages. The
alias table is bilingual because the files are; a column headed `الموضوع` and
one headed `Subject` mean the same thing.
