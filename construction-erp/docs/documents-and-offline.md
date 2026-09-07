# Majal controlled documents, sheets and offline field work

## Controlled documents

Open **Majal Documents → Controlled Documents**.

1. Configure the client logo and legal contact under
   **Settings → Companies → Document Identity**.
2. Create an English or Arabic template under **Document Templates**.
3. Use only the listed `{{ placeholder }}` values. Majal escapes replacement
   values and sanitizes rich text.
4. Create a document, apply the template and select a different named approver.
5. **Submit for Approval** creates an immutable HTML attachment and SHA-256.
6. The named approver approves that exact revision. The submitter cannot
   approve it.
7. **Issue** is allowed only while the approved checksum still equals the
   current immutable revision.
8. **Preview PDF** renders client identity, revision and approval evidence.

Changing a company logo or address affects new rendering but does not alter the
checksum or stored content of an approved revision.

The optional company approval mark is an internal visual mark. It is not a
qualified electronic signature.

## Structured sheets

Open **Majal Documents → Structured Sheets** for BOQs, estimates, budgets,
valuations, schedules and registers.

- Quantity × unit rate calculates each amount and the sheet total.
- **Freeze Revision** records the exact canonical SHA-256 and prevents edits.
- A manager may **Start New Revision**.
- **Export CSV** includes UTF-8 BOM for Arabic and prefixes formula-like text
  to prevent spreadsheet formula injection.

This editor is intentionally structured and auditable. It is not a lossless
arbitrary XLSX/DOCX editor.

## Optional full office co-editing

For browser-based Word/Excel-compatible collaborative editing, deploy a
separate supported office service and integrate only after:

- license and white-label review;
- per-document authorization and short-lived signed callback URLs;
- antivirus/content-disarm controls;
- data-residency and retention review;
- mobile, Arabic and round-trip compatibility tests;
- resource sizing and monitoring.

Do not expose an office service directly to the internet or treat a community
edition as production-supported without reviewing its published limits.

## Majal Field

Open the **Majal Field** app while online once. The dedicated PWA stores only
the current signed-in user’s field pack. Opening it as another user purges the
previous user’s Majal Field database/cache from that browser.

Use **Sync now** before leaving connectivity. In airplane mode:

- assigned records and previously saved drawings remain available;
- safe actions enter the local Sync Queue;
- going online triggers synchronization;
- applied operations disappear;
- conflicts and rejected operations remain visible for review;
- **Clear this device** removes cached records and unsynchronized changes.

Do not share a device account. Use OS screen lock and one Majal login per
person. High-risk clients should add managed-device controls and encrypted
device storage.
