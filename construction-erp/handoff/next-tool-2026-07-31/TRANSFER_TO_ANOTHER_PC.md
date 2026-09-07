# Continue Majal on another PC

The current source state is local-only:

- branch `codex/odoo19-ui-enhancement` is one commit ahead of GitHub;
- the newest UI, Arabic and access fixes are still uncommitted;
- the isolated preview database and filestore are Docker volumes on the
  original PC.

For that reason, cloning GitHub on another PC does not yet reproduce the exact
current state.

## Safest options

### Option A — another tool on the same PC

Give the tool `COPY_THIS_PROMPT.txt`. It can work directly in:

```text
C:\Users\hossi\Documents\Odoo\construction-erp
```

This is the recommended immediate option because it preserves the working
tree, preview database and Docker volumes.

### Option B — another physical PC

Complete these gates on the original PC first:

1. review `git status --short`;
2. inspect all modified and untracked files for credentials or client data;
3. run the latest full test suite;
4. commit the approved source changes;
5. push the approved branch to the private/controlled GitHub repository;
6. clone that reviewed branch on the new PC.

Do not place `.env`, database dumps, AI keys, Platform Owner credentials,
filestores or client attachments in Git.

### Option C — reviewed offline export

If GitHub cannot be used, explicitly request a reviewed offline source export.
The export must be built from an allowlist of source and documentation paths
after secret scanning. Do not create an archive automatically from every
modified/untracked file.

## Recreate a runnable environment

On the new PC, install:

- Git;
- Docker Desktop with WSL 2;
- a supported Chromium browser.

Then:

1. clone the reviewed branch;
2. copy `.env.example` to `.env`;
3. generate new local secrets;
4. follow `docs/getting-started.md`;
5. install Majal on a new non-production database;
6. install `majal_demo` only when an isolated demonstration dataset is needed;
7. run the test suite before sharing a preview.

The database `majal_upgrade_20260729` and its filestore remain on the original
PC. Move them only through the encrypted backup/restore workflow after
separate approval. Never put a database backup in Git, a normal source ZIP, a
public tunnel, or an AI prompt.

