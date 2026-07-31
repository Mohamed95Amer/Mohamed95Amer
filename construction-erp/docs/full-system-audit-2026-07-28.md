# Majal full-system audit — 28 July 2026

## Executive outcome

The audit covered the full Majal product, not only access rights: construction,
facilities, commercial controls, approvals, portals, BIM, AI, recovery,
branding, mobile behavior, documents and offline field work.

The repository is a strong pilot platform, but the pre-audit build was **not
safe to sell as an unattended production service**. The audit found several
release-blocking authorization and evidence-integrity gaps. This remediation
release closes the highest-risk code paths and adds repeatable acceptance data,
controlled documents and bounded offline field work.

Production approval still requires:

1. the complete isolated automated suite to pass on the release commit;
2. desktop, phone, English, Arabic and WebGL manual acceptance;
3. an off-machine encrypted backup plus a successful restore drill;
4. external penetration testing and deployment hardening;
5. a legal/licensing decision and, where required, a qualified trust-service
   provider.

## Audit method and surface

- 34 pre-existing Majal custom add-ons plus the new document, offline and demo
  packages.
- 40 pre-existing test files and 453 pre-existing test methods before this
  remediation.
- Source-level model, ACL, record-rule, controller, route, workflow, cron,
  report, JavaScript and Docker configuration review.
- Role-based walkthroughs performed independently as:
  - Platform Owner;
  - Company Administrator;
  - Operations Manager;
  - Project / Facility Manager;
  - Engineer / Supervisor;
  - Field User / Technician;
  - portal occupant/client/subcontractor.
- Adversarial checks included direct ORM state writes, cross-company record
  access, legacy permission residue, approval evidence mutation, restore
  cancellation, token ancestry and portal-supplied IDs.

## Role and workspace expectations

| Persona | Portfolio access | Assigned workspace | Administration | Offline scope |
|---|---:|---:|---:|---:|
| Platform Owner | all allowed companies | all | platform, recovery, users | field drafts only |
| Company Administrator | current client company | all | users below own rank | field drafts only |
| Operations Manager | current company | all projects/facilities in scope | no technical settings | field drafts only |
| Project / Facility Manager | assigned projects/locations | assigned teams | operational configuration | assigned field work |
| Engineer / Supervisor | assigned projects/locations | assigned records | none | assigned field work |
| Field User / Technician | assigned projects/assets/orders | own work | none | bounded queue |
| Portal user | explicit portal records only | own requests/contracts | none | none |

Construction-only users must receive no construction RPC access to Facilities
models, and Facilities-only users must receive no construction RPC access.
Hiding a menu is not an authorization control.

## Release-blocking findings and remediation

| Finding | Pre-audit risk | Remediation in this release |
|---|---|---|
| Last Platform Owner could be removed by direct group/role writes or deletion | lockout | model-level write, deactivate and unlink protection |
| Company admin could reach users in another company | tenant breach | target/current-company and allowed-company checks plus scoped action |
| Old Purchase/Inventory/Website/Technical groups survived role changes | privilege escalation | role application is now a strict allowlist |
| Optional business apps previously required raw technical groups | over-privilege and inconsistent client roles | 12 tiered Procurement, Inventory, Finance, HR, Website and AI capability packs with role, family and owner-approval controls |
| Construction/facilities scope only hid menus | RPC data access | global workspace, company, project and facility-assignment record rules |
| Construction projects had no company | cross-tenant ambiguity | required company constraint and controlled backfill |
| Approval steps/requests could be edited directly | evidence forgery | protected transition fields, immutable steps and action-only decisions |
| Approvable records accepted direct approved/certified state writes | workflow bypass | shared action-only state transition guard |
| Named document/drawing approver was not enforced | self-approval | named approver, separation of duties and locked evidence |
| Audit events recorded the superuser instead of the real actor | false audit trail | actor/company captured before the narrow elevated create |
| Cancelled restore marker remained executable | destructive replay | per-request marker, live DB-state verification, expiry, atomic claim and receipt |
| Restore executor ignored request state | cancelled/expired restore | request ID, state, token and expiry checked against live DB |
| DMS directory token compared a directory to itself | unrelated file disclosure | secure ancestor traversal; directory shares disabled by default |
| Facility portal accepted a published asset ID from another company | cross-tenant request | explicit allowed-company filtering on display and submission |
| Product upgrade renamed the client legal company to Majal | legal-data corruption | product brand and `res.company.name` are now separate |

## Functional audit matrix

| Area | Source audit | Automated coverage | Manual acceptance still required |
|---|---|---|---|
| Authentication/MFA/passkeys | reviewed | module tests | mail delivery, enrollment, lockout recovery |
| Six Majal roles | reviewed and remediated | role/tenant tests | client-specific role workshop |
| Construction portfolio/projects | reviewed | existing suite + demo scenarios | real project import |
| BOQ/change/progress/subcontracts/tenders | reviewed | existing module tests | accounting localization and tax |
| Drawings/RFI/submittals/forms/defects | reviewed | existing + new workflow tests | real PDFs, phone camera |
| HSE/meetings/materials/planning | reviewed | existing module tests | field sign-off procedure |
| Facilities/assets/PM/SLA/contracts/stores | reviewed | existing + assignment tests | real asset hierarchy and store process |
| QR/NFC | reviewed | asset tests | physical Android/iOS tags |
| BIM | reviewed | parser/viewer tests | hardware WebGL and real IFC models |
| Majal Intelligence | reviewed | provider/unit tests | customer key, provider quota and prompt evaluation |
| Documents/sheets | new controlled foundation | checksum/version/token tests | PDF typography, client templates |
| Offline field work | new bounded foundation | idempotency/conflict tests | airplane-mode phone acceptance |
| Backup/restore | reviewed and hardened | model/executor checks | off-machine restore drill |
| Branding/Arabic/mobile | reviewed | static/UI tests | visual regression in supported browsers |

## Deliberate product boundaries

### Documents and signatures

Majal now provides safe rich-text templates, exact immutable revisions,
SHA-256-bound internal approvals, client logo/legal identity and structured
commercial sheets. This is an operational sign-off, not a qualified electronic
signature. Documents marked as requiring a qualified signature must be sent to
an approved external trust-service provider.

The structured sheet editor is not a claim of lossless arbitrary Excel
round-tripping. A full Word/Excel-compatible co-editor requires an optional
supported office service and its license/security review.

### Offline

Allowed offline:

- view saved assigned work;
- draft a defect or daily log;
- answer supported inspection fields;
- update an assigned work-order checklist/note;
- record an authenticated assigned-asset scan;
- save selected current drawing PDFs.

Online only:

- approvals and signatures;
- financial, invoice, stock or contract posting;
- deletes and final closure;
- external sending;
- administration and user changes;
- BIM/WebGL operations.

Every queued mutation has a client UUID, user owner and base `write_date`.
Duplicates are idempotent. Stale records become visible conflicts and are not
silently overwritten.

### Recovery

The seven local recovery slots are operational convenience, not disaster
recovery by themselves. A production service also needs encrypted off-machine
copies, monitoring, retention policy and scheduled restore drills. Database and
filestore capture on a live mutable system is not a storage-level atomic
snapshot; high-assurance deployments should use a coordinated maintenance
window or infrastructure snapshot.

## Demo acceptance environment

Install `majal_demo` only in an isolated demo/QA database. It creates:

- two synthetic companies;
- nine internal personas spanning all role/scope combinations;
- three construction projects with assignments;
- BOQ, tasks, RFIs, defects, inspection, drawings and daily logs;
- a facility hierarchy, six tagged assets, job plan and work orders;
- English and Arabic document templates;
- an issued checksum-bound document and a frozen estimate sheet.

All demo users use `MajalDemo!2026`. Never install this package in a client or
internet-facing production database.

## Exit criteria for sale

- No P0/P1 open authorization or evidence-integrity defect.
- Full clean-database install and all tests pass.
- Upgrade test from the previous client release passes on a cloned database.
- Two-company cross-tenant suite passes for internal, portal and public routes.
- English/Arabic desktop and mobile acceptance passes.
- Physical QR and NFC acceptance passes.
- BIM acceptance passes on supported hardware with a representative IFC.
- Backup creation, off-machine replication and destructive restore drill pass.
- SBOM, license notices, privacy/DPA, support policy and incident runbook exist.
- Monitoring, TLS, secrets, mail authentication and vulnerability scanning are
  active in the production environment.
