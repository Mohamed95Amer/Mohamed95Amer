# Majal White-Label and Productization Plan

## Outcome

Turn the current construction and facilities platform into a client-ready
product called **Majal**:

- no Odoo visual identity in the normal user experience;
- a consistent Majal design across navigation, messaging, activities, forms,
  dashboards, portals, mobile installation, reports and emails;
- configurable client branding without maintaining a separate code fork for
  every customer;
- a secure hosted demo that prospects can access by link;
- repeatable deployment, upgrades, backups, monitoring and support;
- a documented licensing route suitable for the chosen business model.

This is a product and engineering plan, not legal advice. The final licensing
model should be reviewed by counsel before commercial launch.

## Current position

The repository already has a strong starting point:

- `construction_ui` supplies the Majal login, navigation palette, application
  launcher, original module icons, responsive dashboards and Arabic/RTL
  refinements.
- `majal_security` supplies password-policy, passkey and MFA foundations.
- Construction and Facilities landing dashboards, project workspaces, portals,
  BIM, QR/NFC asset tags and Arabic translations are already present.
- Odoo Community, OCA and third-party sources are pinned for reproducible
  builds.

The remaining visible platform identity is concentrated in:

- Discuss, chat and activity dropdowns;
- OdooBot/default avatars, channel glyphs and empty-state illustrations;
- Settings navigation and the About block;
- PWA manifest, installed-app name, app icons and theme colour;
- browser title, favicon and some error/help surfaces;
- system emails, invitations, notifications, reports and portal footers;
- developer/admin screens and module metadata.

## Decision gate: commercial license route

### Route A — managed open-source service

This is the fastest route to market. Sell the configured, hosted Majal service,
implementation, support, training and industry workflows. Prospects receive a
demo URL and credentials rather than repository access.

The installed stack currently includes AGPL-3 components, notably the OCA
`contract` and `maintenance_equipment_contract` modules. Majal's
`facility_contract` and `facility_inventory` modules are also declared
AGPL-3. Users who interact with modified AGPL software over a network must be
offered its corresponding source. The offer can live on an administrator/legal
page; source code does not need to be the product's landing page.

### Route B — source-confidential commercial product

Choose this if the business requirement is that customers and demo users must
not be entitled to the proprietary source.

Before launch:

1. inventory every installed module and transitive dependency;
2. replace `contract` and `maintenance_equipment_contract` with new
   Majal-owned implementations based only on compatible LGPL/permissive
   components;
3. rewrite or separate `facility_contract` and `facility_inventory` where
   required;
4. remove unused AGPL modules from the distributable image and add-on path;
5. verify that all remaining third-party licenses permit the intended
   deployment and distribution;
6. add a complete license/notice bundle and obtain legal review.

Odoo 18 Community itself is LGPL-3. That permits commercial use and
white-labelling, subject to its license obligations. Odoo Enterprise code must
not be copied or used without a valid subscription.

### Recommendation

Launch a managed-service pilot using Route A while the market is validated.
Only pay the cost of Route B if source confidentiality proves commercially
important. The saleable value is the construction/facilities workflows,
implementation, hosting, data, support and domain expertise—not the absence of
an open-source notice.

## Workstream 1 — brand system and configuration

Create a dedicated `majal_branding` module instead of continuing to scatter
brand overrides through functional modules.

Add per-company/product configuration for:

- product name, short name and tagline;
- primary, navigation, accent, surface and semantic status colours;
- light/dark logos, favicon, maskable mobile icon and report mark;
- support URL, support email, privacy URL and terms URL;
- login welcome text and portal footer;
- optional client co-branding.

Use CSS custom properties generated from these settings. Keep accessibility
contrast and status meaning fixed even when client colours change. This makes
client white-labelling configuration, not a new code branch.

## Workstream 2 — complete backend white-label

### Navigation and controls

- Apply Majal styling to every systray menu, dropdown, toast, dialog, tooltip,
  date picker, command palette, loading state and error screen.
- Replace remaining purple focus, selection, unread and progress states with
  the Majal design tokens.
- Keep red/amber/green reserved for actual risk, warning and success.
- Add consistent touch targets, keyboard focus states and RTL behaviour.

### Discuss and chat

- Redesign the inbox as modern conversation cards with clear unread count,
  sender, context, latest message and timestamp.
- Restyle channel chips, composer, attachments, reactions and thread panel.
- Rename the system assistant to **Majal Assistant** in English and
  **مساعد مجال** in Arabic.
- Replace canned platform-specific introduction text with Majal onboarding.
- Replace OdooBot, default people and channel artwork with original Majal
  assets or neutral monogram avatars.
- Create purpose-specific notification illustrations for no messages, delivery
  failure, offline and empty channels.

### Activities

- Redesign the activity dropdown around urgency: Overdue, Today, Upcoming.
- Replace inherited module artwork with a coherent original glyph set for work
  orders, inspections, RFIs, drawings, approvals, purchase orders and tasks.
- Show project/facility context and provide direct actions without opening a
  second screen.
- Ensure the dropdown and its list can scroll naturally on phone and desktop.

### Forms, tabs and empty states

- Audit every standard and custom module for remaining default colour classes,
  Odoo help links and vendor illustrations.
- Replace generic empty states with industry language and an immediate next
  action.
- Standardize Save, Discard, approval, destructive and secondary actions.
- Test all overlays and full-height client actions, including BIM, on mobile.

## Workstream 3 — Settings, About and legal presentation

Remove the current public-facing About block containing Odoo QR codes, version
artwork and Odoo promotional links.

Replace it with an administrator-only **Majal System Information** page:

- Majal product edition and release version;
- build identifier and deployment environment;
- client organization and enabled industry packs;
- support contact, documentation, privacy and terms;
- backup/health summary without exposing secrets;
- open-source notices and source offer where required.

The normal Settings page can omit Odoo branding completely. Do not erase
copyright and license obligations from distributed files. Keep compliance
information in a clear legal/notices page even when it is not part of the
everyday product UI.

Also hide developer-only menus from client administrators unless they are
explicitly granted a Majal platform-admin role.

## Workstream 4 — identity outside the backend

- Override `/web/manifest.webmanifest` with Majal name, icons, colours,
  display mode and field-workspace start URL.
- Replace browser title, favicon and social/link-preview metadata.
- Brand login, password reset, invitations, access-code messages and 2FA.
- Brand outgoing email layout, notification footer and sender name.
- Brand PDF/report headers, footers, page colours and document metadata.
- Brand portal navigation, empty states, errors and offline page.
- Remove Odoo promotional links from normal customer-facing templates.
- Add English and Arabic translations for every new visible string.

## Workstream 5 — product editions

Package modules as tested industry editions rather than exposing the technical
app list:

### Majal Construction

- Project Controls
- Tenders and Commercial
- Site Operations and Daily Logs
- Quality, RFIs, Submittals and Snags
- Drawings, Revisions and Approvals
- BOQ, Budget, Procurement and Stock
- BIM Coordination
- Client and Subcontractor Portals

### Majal Facilities

- Asset Register and Digital Asset Passport
- QR/NFC Asset Tracking
- Service Requests and Work Orders
- Preventive Maintenance
- SLA and Contract Management
- Spare Parts and Stores
- Floor Plans and Location Hierarchy
- Client and Technician Portals

### Shared platform

- Finance, purchasing, inventory, people, approvals, dashboards, notifications,
  audit trail, security and Arabic/English.

Use feature flags and module bundles for editions. Avoid separate repositories
or per-client source branches.

## Workstream 6 — secure prospect demo

Do not expose the current Windows/local Docker instance or the demo database.
Create a separate Linux-hosted demonstration environment.

### Demo architecture

- dedicated `demo` hostname with HTTPS;
- isolated database and file store containing synthetic data only;
- no connection to production, GitHub credentials or client integrations;
- role-based prospect accounts: Executive, Project Manager, Site Engineer,
  Facilities Manager and Technician;
- remove database management, developer mode, module installation and system
  settings from demo roles;
- disable or constrain bulk export, outbound email, WhatsApp, webhooks and
  unrestricted file upload;
- rate-limit login, enable MFA for demo administrators and record audit events;
- reset the database and attachments from a known snapshot on a schedule;
- automatically expire invitations and inactive demo accounts;
- monitoring, error alerting and an immediate revoke switch.

Prospects receive a URL and temporary credentials or an invitation. Do not use
a shared administrator password. A guided tour and realistic synthetic project
make the link useful without exposing source-control details.

For Route A, place the required AGPL source offer in the legal/notices page.
For Route B, complete the dependency replacement and legal audit before making
the source repository private or claiming source confidentiality.

## Workstream 7 — production platform

One client should be one isolated database at minimum; higher-risk clients
should receive an isolated application and database stack.

Required production capabilities:

- Linux deployment behind a maintained reverse proxy and HTTPS;
- secrets manager rather than committed or shared environment files;
- encrypted database and attachment backups, off-site copies and restore tests;
- outbound mail with SPF, DKIM and DMARC;
- central logs, uptime checks, error reporting and resource alerts;
- vulnerability, dependency and container-image scanning;
- automated database migrations and pre-upgrade backups;
- immutable release versions and rollback procedure;
- per-client retention, privacy, data residency and deletion policy;
- onboarding, role templates, import tools and administrator training;
- support desk, response targets, maintenance windows and incident procedure.

Create commercial documents before the first paid production tenant:

- order form and subscription terms;
- scope and implementation statement of work;
- SLA and support policy;
- privacy notice and data-processing agreement;
- acceptable-use and backup/retention policies;
- third-party notices and software bill of materials.

## Delivery phases

### Phase 0 — product and license decision

Deliverables:

- installed-module/dependency license matrix;
- Route A or Route B decision;
- product name/domain/trademark check;
- source and notice policy;
- final Majal brand kit.

Acceptance: every shipped and hosted component has an owner, pinned version,
license and commercial-use decision.

### Phase 1 — visual white-label

Deliverables:

- configurable Majal branding module;
- navigation, chat, activities, avatars, empty states and Settings/About;
- browser/PWA/email/report/portal identity;
- complete English and Arabic strings.

Acceptance: an automated visible-string and asset scan plus manual desktop,
tablet, phone, English and Arabic QA finds no Odoo promotional identity in
normal user or client-admin journeys.

### Phase 2 — sales demo

Deliverables:

- isolated hosted demo, five role-based tours, synthetic data and scheduled
  reset;
- demo invitation and expiry workflow;
- monitoring and operational runbook.

Acceptance: a prospect can explore the assigned workflow without developer
access, contacting third parties, seeing another prospect's changes, or
learning source-control credentials.

### Phase 3 — production readiness

Deliverables:

- repeatable tenant provisioning;
- backup/restore, monitoring, patching, migration and rollback pipelines;
- security assessment and permission matrix;
- commercial/legal/support documents.

Acceptance: a clean client tenant can be provisioned from a signed release,
tested, backed up, restored and upgraded using documented automation.

### Phase 4 — pilot and scale

Deliverables:

- one Construction pilot and one Facilities pilot;
- measured onboarding time, task completion, mobile use and support load;
- prioritized improvements and release cadence.

Acceptance: pilot users complete the core workflows, support incidents are
tracked, and the next release is based on observed usage rather than visual
preference alone.

## Suggested implementation order

1. Decide Route A versus Route B.
2. Split `majal_branding` from `construction_ui` and introduce tokens.
3. Replace About, assistant/avatars and the PWA/browser identity.
4. Redesign chat and activities.
5. Audit all remaining visible strings, artwork, emails and reports.
6. Complete bilingual and responsive regression testing.
7. Deploy the isolated sales demo.
8. Complete production automation and security review.
9. Run the two pilots before broad sales.

## Authoritative references

- Odoo 18 license documentation:
  https://www.odoo.com/documentation/18.0/legal/licenses.html
- GNU license FAQ, including AGPL network interaction:
  https://www.gnu.org/licenses/gpl-faq.html
- Odoo 18 production deployment and HTTPS guidance:
  https://www.odoo.com/documentation/18.0/administration/on_premise/deploy.html
- Odoo brand assets and trademark guidance:
  https://www.odoo.com/page/brand-assets
