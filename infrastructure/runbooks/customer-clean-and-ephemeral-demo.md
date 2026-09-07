# Clean customer template and one-hour demonstrations

## Outcome

MajalOps uses two deliberately separate environments on the internal platform server:

| Address | Purpose | Data policy |
|---|---|---|
| `https://platform.majalops.com` | Clean customer-ready template and internal acceptance | No synthetic demo module and no prior test transactions |
| `https://demo.majalops.com` | Sales demonstrations and destructive testing | Synthetic data only; separate database and filestore; destroyed after 60 minutes by default |

The platform host remains an internal demo/staging system. A paying customer must receive an isolated deployment, database, filestore, secrets and backup boundary. Do not host two customers in this slot.

## Safety properties

- The clean reset first creates a paired PostgreSQL and filestore backup.
- A clean candidate database is built without demo records and validated before cutover.
- The old database is renamed and kept offline during acceptance, so rollback is possible.
- The demo receives a unique database name, random password and dedicated Docker volume.
- The demo receives a short-lived PostgreSQL role that owns only the demo database; the container never receives the platform database-owner credential.
- Demo mail servers, scheduled jobs and local AI access are disabled.
- The demo uses a separate Odoo runtime profile so synthetic XML records are allowed only there; the customer profile continues to enforce `without_demo = all`.
- The demo is bounded to 15–240 minutes and is automatically destroyed with a transient systemd timer.
- Session metadata persists only so the boot reconciliation service can destroy an interrupted demo after a reboot; it is root-readable and removed with the demo.
- Destructive scripts validate an exact generated database-name pattern before deletion.

## Create the clean customer template

Review the backup destination and ensure the current application is healthy. Then run:

```bash
sudo CONFIRM_RESET=RESET-CUSTOMER-TEMPLATE \
  bash /opt/majalops/infrastructure/scripts/reset-customer-database.sh
```

Verify login, installed applications, Arabic/English switching, permissions and `/majal/health`. The script prints the offline retired database name. Keep it only until acceptance; preserve the encrypted backup according to the stated retention policy.

## Start a demonstration

The standard one-hour session is one command:

```bash
sudo TTL_MINUTES=60 \
  bash /opt/majalops/infrastructure/scripts/start-demo.sh
```

The command prints the URL, login, randomly generated password and UTC expiry. Retrieve them later with:

```bash
sudo bash /opt/majalops/infrastructure/scripts/demo-status.sh
```

Start a fresh session after the previous one expires, or explicitly replace it:

```bash
sudo TTL_MINUTES=60 REPLACE_ACTIVE=YES \
  bash /opt/majalops/infrastructure/scripts/start-demo.sh
```

For local testing before public DNS exists, override only the health probe:

```bash
sudo DEMO_HEALTH_URL=http://127.0.0.1/healthz TTL_MINUTES=60 \
  bash /opt/majalops/infrastructure/scripts/start-demo.sh
```

## End a demo early

```bash
sudo CONFIRM_DESTROY=YES \
  bash /opt/majalops/infrastructure/scripts/stop-demo.sh
```

This drops only the generated `majal_demo_YYYYMMDD_HHMMSS_xxxxxx` database and the Compose volume labelled `majal-demo-data`.

## What the synthetic demo contains

The opt-in `majal_demo` generator creates role-based users, two companies and high-volume construction and facilities-management scenarios. It includes projects, tasks, procurement, drawings, quality, safety, BIM links, property records, assets, meters, preventive maintenance, work orders, contracts, floor plans, QR/NFC scans, spares and operational dashboards. Property module XML demo records are loaded during the isolated database initialization.

## DNS and HTTPS

Create one DNS-only Cloudflare A record:

```text
Type: A
Name: demo
Content: 178.105.174.55
Proxy: DNS only
TTL: Auto
```

Caddy obtains and renews HTTPS automatically. The DNS record remains in place while the disposable database/container comes and goes. After expiry the domain returns a friendly expired-session response instead of exposing another database.

## Logs and incident checks

```bash
sudo tail -n 200 /var/log/majalops/demo-lifecycle.log
sudo systemctl status majalops-demo-expiry.timer --no-pager
sudo docker compose --env-file /etc/majalops/platform.env \
  -f /opt/majalops/infrastructure/docker/compose.platform.yml --profile demo ps
```

Never paste the generated password into source control, tickets or public chat. It lives only in the root-readable runtime session file and disappears when the session is destroyed.
