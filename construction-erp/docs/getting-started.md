# Getting started, from nothing

Written for somebody who has never used a terminal. Nothing here needs
programming — it is copying four commands and waiting.

Docker runs the whole system, database included, inside a sandbox on your
computer. Nothing is installed permanently and removing it later is one
command. You need about **10 GB of free disk**, 8 GB of memory, and roughly
**30 minutes**, most of it waiting.

## 1. Install Docker Desktop

Download it from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
— Windows or Mac — install it the ordinary way, then **open it**.

On Windows it may ask to install WSL2 and restart. Say yes, and let it restart.

Wait until Docker Desktop says **Running** (a whale icon appears near the
clock). Leave it open; everything below needs it running. This is the only real
installation on the list.

## 2. Get the code

The simplest way needs no extra tools:

1. Open the branch on GitHub.
2. Click the green **Code** button, then **Download ZIP** (about 80 MB).
3. Unzip it — right-click → Extract All on Windows, double-click on a Mac.
4. Move the unzipped folder somewhere easy. The Desktop is fine.

Inside it is a folder called `construction-erp`. That is the one that matters.

Alternatively, if you already have git:

```bash
git clone -b claude/odoo-construction-facilities-i324s2 \
  https://github.com/Mohamed95Amer/Mohamed95Amer.git majal
cd majal/construction-erp
```

## 3. Open a terminal

A terminal is a window where you type a command and press Enter. That is all it
is.

- **Windows:** click Start, type `powershell`, press Enter.
- **Mac:** press ⌘ + Space, type `terminal`, press Enter.

## 4. Point it at the folder

Type `cd` and a space — do not press Enter yet — then **drag the
`construction-erp` folder onto the terminal window**. It pastes the path for
you. Now press Enter.

Check you are in the right place with `ls` (Mac) or `dir` (Windows). You should
see `custom-addons`, `docker-compose.yml` and `scripts`.

## 5. Start the system

```bash
cp .env.example .env
docker compose up -d --build
```

Three to ten minutes of scrolling text while it downloads and builds. It is
finished when the cursor comes back.

## 6. Install into a database

One long command. **Windows PowerShell does not accept the `\` line breaks**, so
use the single-line form there; Mac and Linux can use either.

```bash
docker compose exec odoo odoo -c /etc/odoo/odoo.conf -d erp \
  -i construction_base,construction_boq,construction_drawing,construction_rfi,\
construction_submittal,construction_pin,construction_planning,construction_defect,\
construction_daily_log,construction_form,construction_progress_billing,\
construction_change_order,construction_subcontractor,construction_report,\
construction_hse,construction_tender,construction_material,construction_dashboard,\
construction_meeting,construction_bim,construction_whatsapp,construction_portal,\
facility_asset,facility_workorder,facility_sla,facility_contract,\
facility_inventory,facility_portal,facility_floorplan,construction_ui,\
majal_branding,majal_administration,majal_ai,majal_documents,\
majal_field_offline,majal_security,om_account_accountant \
--load-language=ar_001 --stop-after-init
```

About ten minutes, and it will look frozen for long stretches. It is not. It is
building the demo company: the Al Noor Tower project, its bill of quantities, a
certified payment certificate, and one variation left waiting for a signature.
The `--load-language=ar_001` option installs the Arabic interface catalog as
part of the same operation; merely activating Arabic later does not populate
all module translations.

## 7. Open it

```bash
docker compose restart odoo
```

Wait thirty seconds, then open <http://localhost:8069>. Log in as `admin` /
`admin`.

## Who to log in as

The point of an approval chain is that people see different things, so the demo
ships four:

| Login | Password | Who | What they see |
|---|---|---|---|
| `admin` | `admin` | Administrator | Everything, including Configuration → Approval Rules |
| `omar.pm` | `omar.pm` | Project manager | A variation waiting for his signature — the first rung |
| `hala.director` | `hala.director` | Commercial manager | Nothing yet: her rung comes after Omar signs |
| `nadia.qs` | `nadia.qs` | Quantity surveyor | The bill and certificate she already signed |

Worth doing first: log in as `omar.pm`, open **My Day**, approve the one thing
waiting. Log in as `hala.director` and it is now on her screen and not his. Then
as `admin`, open **Commercial Exposure**: the 197,400 has moved from "submitted
and not yet approved" into the contract.

These passwords exist in demo data only.

### Full Majal acceptance dataset

For an isolated demo or QA database only, install:

```powershell
docker compose exec odoo odoo -c /etc/odoo/odoo.conf -d erp -i majal_demo --stop-after-init
```

This creates two synthetic companies and nine Majal personas. Their password
is `MajalDemo!2026`. Never install `majal_demo` in a client production
database or expose these credentials on the internet.

After restarting, open **Majal Field** once while online to prepare its offline
field pack. Controlled templates, documents and sheets are under
**Majal Documents**.

## Assigning optional business capabilities

Open **Administration → Users & Access**, select a client user and choose
**Change Access**. The dialog contains the six Majal roles, Construction /
Facilities scope and optional capability packs.

Available families are Procurement, Inventory, Finance, Human Resources,
Website and AI Administration. Select only one tier per family. Majal checks
the minimum business role, removes technical access when a pack is removed,
and records the old and new capability codes in the immutable administration
audit.

Finance Administrator, HR Administrator and Website Designer are high-risk
tiers and require a Platform Owner. Company Administrators can assign the
lower approved tiers only to users below their own role and inside their
current company.

The read-only **Administration → Capability Catalog** explains every tier.
Never add Purchase, Stock, Accounting, HR, Website or technical groups through
the upstream raw permission grid.

## Turning on the 3D model viewer

Open a BIM model and you may get **"The 3D libraries are not installed"**. That
is expected on a fresh copy, not a fault: the viewer's two libraries — web-ifc
and three.js — are about 6 MB and are fetched by a script rather than committed
to the repository. Everything else about the model, its element index and the
records linked to it, works without them.

Run this **on your own machine, in the `construction-erp` folder** — not inside
the container. Docker mounts `custom-addons` read-only, so the container cannot
write these files even if you ask it to.

**Mac or Linux**

```bash
./scripts/fetch-bim-libs.sh
```

**Windows**

The `.sh` script cannot run in PowerShell, so there is a PowerShell version:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\fetch-bim-libs.ps1
```

Either way it downloads about 8 MB and prints `>> BIM libraries in ...`. Then
**reload the model page in your browser**. No restart, no reinstall — the files
are served straight off disk.

If your company blocks `registry.npmjs.org`, download the two packages by hand
from any machine that can reach it and drop the files here:

```
custom-addons/construction_bim/static/lib/web-ifc/web-ifc-api-iife.js
custom-addons/construction_bim/static/lib/web-ifc/web-ifc.wasm
custom-addons/construction_bim/static/lib/three/three.module.min.js
```

They come from `web-ifc@0.0.77` and `three@0.170.0` — both from the npm
registry, MPL-2.0 and MIT respectively.

## Stopping, starting, removing

```bash
docker compose stop     # stop it
docker compose start    # start it again, data intact
docker compose down -v  # remove everything, database included
```

## If something goes wrong

| What you see | What it means |
|---|---|
| `docker: command not found` | Docker Desktop is not installed, or the terminal was open before you installed it. Open a new terminal. |
| `Cannot connect to the Docker daemon` | Docker Desktop is not running. Open it and wait for **Running**. |
| `no such file or directory` after `cd` | Wrong folder. Redo step 4 and check with `ls` / `dir`. |
| `port is already allocated` | Something else is using port 8069. Quit it, or change the port mapping in `docker-compose.yml`. |
| The page will not load | Give it another minute after the restart, then reload. Odoo is slow on its first boot. |

## Without Docker

The path CI runs, and the one used to verify the suite:

```bash
./scripts/fetch-odoo.sh                 # pinned shallow clone of Odoo 18 core
pip3 install -r vendor/odoo/requirements.txt -r requirements-oca.txt
./scripts/init-db.sh erp                # same module list, one command
./scripts/run-local.sh -d erp           # serves on :8069
./scripts/run-tests.sh all              # the full suite
```

## One trap

Do not change `DB_PASSWORD` in `.env` on its own. `odoo.conf` carries
`db_password = odoo`, and the config file wins over the environment — change one
without the other and the connection breaks. Change both or neither.
