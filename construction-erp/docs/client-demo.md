# Majal Client Demo

The client demo is a separate, disposable Linux deployment. It must never use
the local Windows database or a customer's production database.

## Prospect experience

Each prospect receives:

- the HTTPS demo URL;
- an individual, expiring account;
- one role aligned to the tour: Executive, Project Manager, Site Engineer,
  Facilities Manager or Technician;
- synthetic projects, facilities, assets, work orders and commercial data;
- a short guided scenario.

Prospects receive no GitHub credentials and no application-administrator
account. Route A's open-source notices and corresponding-source offer remain
available from the Help menu and portal footer.

## Host preparation

Use a maintained Linux host with Docker Engine and Compose. Point the demo DNS
name to the host before starting; Caddy obtains and renews HTTPS automatically.

```bash
cd construction-erp/deploy/demo
cp .env.example .env
# Replace every placeholder with an independent random secret.
docker compose build
docker compose up -d db
docker compose run --rm majal \
  odoo -c /etc/odoo/odoo.conf -d erp \
  -i majal_security,construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_form,construction_progress_billing,construction_change_order,construction_subcontractor,construction_report,construction_hse,construction_tender,construction_material,construction_dashboard,construction_meeting,construction_bim,construction_whatsapp,construction_portal,facility_asset,facility_workorder,facility_sla,facility_contract,facility_inventory,facility_portal,facility_floorplan,construction_ui,majal_branding,om_account_accountant \
  --stop-after-init
docker compose up -d
```

Run `scripts/fetch-bim-libs.sh` before building the demonstration image when
BIM is part of the tour.

## Before sharing the link

1. Set the public base URL to the HTTPS demo hostname.
2. Configure the Majal product name, support contact, privacy and terms links.
3. Replace the local `admin` login and enroll demo administrators in MFA.
4. Create the five demo roles using least privilege.
5. Remove developer mode, Settings, Apps, database management and exports from
   prospect roles.
6. Disable outbound email, SMS, WhatsApp and webhooks unless they point to a
   controlled sandbox.
7. Confirm that all people, documents, files and identifiers are synthetic.
8. Test English, Arabic, desktop and phone tours.
9. Verify backups and the reset procedure.
10. Confirm `/majal/legal/open-source` matches the deployed release.

## Reset model

Build one approved golden database and filestore after the demo is configured.
Keep that snapshot encrypted and outside the running containers.

For every reset:

1. revoke active prospect sessions and stop the Majal application;
2. back up the current demo only if sales needs it for follow-up;
3. restore the golden database and matching filestore together;
4. rotate or recreate prospect accounts;
5. start the application and run the smoke test;
6. record the reset time and release identifier.

Database and filestore must always be restored as a pair. Do not automate a
destructive reset until the exact host paths, snapshot destination and restore
test are reviewed.

## Operating controls

- Put login rate limiting and abuse controls at the hosting edge.
- Alert on downtime, repeated login failures, 5xx responses, disk use and
  backup failure.
- Set account expiration and review the demo user list weekly.
- Apply security updates through a signed release, never by editing a running
  container.
- Preserve access and application logs for the agreed retention period.
- Keep an immediate revoke switch: stop the edge service or disable all demo
  users.

## Smoke test

- Login and logout.
- Construction and Facilities landing dashboards.
- Project workspace and document workflows.
- Work order, inspection and approval flows.
- QR/NFC secure scan without bypassing authentication.
- BIM viewer load and mobile details drawer.
- Discuss, activities, Help and open-source notices.
- Arabic RTL navigation.
- No outbound message reaches a real recipient.
