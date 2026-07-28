# Majal administration and recovery

## Client user administration

Open **Administration → Users & Access** or
**Settings → Majal Administration → Manage Client Users**.

Majal deliberately does not give a client administrator the raw technical
group matrix. They create a user, select one approved role and select the
workspace scope:

| Access level | Intended use | User administration | Recovery |
|---|---|---:|---:|
| Platform Owner | Named product owner / senior system custodian | All levels | Create, export and prepare restore |
| Company Administrator | Client IT or business administrator | Operations Manager and lower | None |
| Operations Manager | Cross-project or cross-facility leadership | None | None |
| Project / Facility Manager | Day-to-day delivery ownership | None | None |
| Engineer / Supervisor | Site or facilities supervision | None | None |
| Field User / Technician | Assigned operational work | None | None |

Every role can be scoped to **Construction**, **Facilities Management**, or
**Construction & Facilities**. Majal removes the previously managed industry
groups before applying the new role, while leaving unrelated explicit business
groups untouched.

Controls enforced on the server:

- a Company Administrator cannot grant Company Administrator or Platform
  Owner;
- no administrator can change an account at or above their own rank;
- users cannot deactivate themselves;
- the last active Platform Owner cannot be deactivated;
- client administrators cannot edit the raw technical permission groups;
- access changes and account activation changes are recorded in the immutable
  Administration Audit.

Production should have two individually named Platform Owners. Do not use a
shared administrator account.

## Seven recovery slots

Open **Administration → Backup & Recovery** or use **Backup Now** in Settings.
The scheduled job runs daily at 01:30 server time and keeps at most seven
curated archive files:

| Slot | Update rule |
|---|---|
| Today | Replaced after every successful daily or manual backup |
| Yesterday | Previous Today archive |
| Day before yesterday | Previous Yesterday archive |
| Weekly checkpoint | Refreshed every Monday |
| Two-week checkpoint | Refreshed every second ISO week |
| Monthly checkpoint | Refreshed on the first day of each month |
| Three-month checkpoint | Refreshed on 1 January, April, July and October |

These are retention tiers, not fabricated exact ages. The screen always shows
the actual timestamp and age. New installations initially show empty scheduled
slots and fill them over time.

Each ZIP contains:

- `dump.sql`, a transaction-consistent PostgreSQL export;
- `filestore/`, including uploaded drawings, photos, PDFs and attachments;
- `manifest.json`, containing platform, PostgreSQL and installed-module
  versions;
- a SHA-256 checksum stored in Majal and checked again before download or
  restore.

Archives are written with mode `0600` below the protected Odoo data volume,
normally `/var/lib/odoo/majal_backups`. The application refuses a configured
backup path outside that volume and checks minimum free storage before export.

## Protected restore

A live web process must never be able to replace its own database. Restore is
therefore two-step:

1. A Platform Owner opens a verified recovery point and chooses
   **Prepare Restore**.
2. They type the database name and `RESTORE ERP`.
3. Majal generates a one-time recovery code that expires after two hours and
   writes a checksum-bound request into the protected data volume.
4. A deployment operator opens PowerShell in the repository folder and runs
   the exact command shown by Majal:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\restore-majal.ps1 -Slot today -Code ONE_TIME_CODE
   ```

The script stops the application, validates the code, expiry, archive path,
checksum and ZIP contents, restores into a replacement database, restores the
filestore, validates the installed-module table, and only then removes the
temporary safety database. If validation fails it automatically rolls the
original database and filestore back before restarting Majal.

Never test restore for the first time during an incident. Run a quarterly
restore drill into an isolated non-production environment and record the
measured recovery time.

## Production backup boundary

The seven local points provide fast operational rollback; they are not the
whole disaster-recovery strategy. Before sale:

- copy encrypted backups to a separate account and region;
- make at least one copy immutable against application credentials;
- monitor the daily job, archive age, free space and off-site replication;
- define client-specific recovery-point and recovery-time objectives;
- keep the encryption key outside the application host;
- test both database records and attachment downloads after restore;
- take a protected point immediately before every application upgrade.
