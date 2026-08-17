# Monitoring

The monitoring overlay deploys Prometheus, Alertmanager, node-exporter, postgres-exporter, and blackbox-exporter. Prometheus and Alertmanager publish only to `127.0.0.1`; no exporter is publicly reachable.

Built-in alerts cover:

- local platform health and repeated automatic recovery;
- public HTTPS reachability;
- root-disk, memory, and sustained load pressure;
- PostgreSQL availability; and
- stale off-site backups.

`configure-monitoring.sh` resolves all monitoring image tags to immutable digests, writes secrets as individual root-only files, validates Prometheus and Alertmanager configuration using the selected container images, and starts the merged stack.

Any combination of these channels can be enabled later without changing Git:

- SMTP email: `ALERT_EMAIL_TO`, `SMTP_SMARTHOST`, `SMTP_FROM`, `SMTP_USERNAME`, `SMTP_PASSWORD`;
- Slack: `SLACK_WEBHOOK_URL`;
- Microsoft Teams: `TEAMS_WEBHOOK_URL`;
- Discord: `DISCORD_WEBHOOK_URL`; and
- generic receiver: `GENERIC_WEBHOOK_URL`.

When no channel is configured, metrics and alerts still run locally and GitHub's external-health workflow can provide an independent off-host signal. After adding a channel, deliberately stop the Majal container, confirm delivery and resolution, then allow automatic recovery to restore it.
