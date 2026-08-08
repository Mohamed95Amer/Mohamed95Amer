# Demo accounts — who to log in as, and what you should see

Every login below is created by **demo data**, so it exists only on a
database installed with demo enabled. Never on production.

**Password for all of them: `MajalDemo!2026`**

Two sets exist. The first arrives with the ordinary construction and
facilities modules. The second is a larger two-company acceptance dataset
that has to be installed on purpose.

---

## Set 1 — always present with demo data

| Login | Name | Role | Installed by |
|---|---|---|---|
| `admin` | Administrator | Everything | core |
| `hala.director` | Hala Mansour | Construction Manager (signs anything) | `construction_base` |
| `omar.pm` | Omar Farouk | Project Manager | `construction_base` |
| `nadia.qs` | Nadia Karim | Commercial / QS | `construction_base` |
| `yusuf.engineer` | Yusuf Rahman | Site Engineer | `construction_base` |
| `samir.site` | Samir Haddad | Site User (foreman) | `construction_base` |
| `layla.fm` | Layla Nasser | Facilities / Equipment Manager | `facility_asset` |
| `tariq.tech` | Tariq Aziz | Technician (plain internal user) | `facility_asset` |
| `occupant@demo.facilities` | Nadia Haddad | Portal occupant | `facility_portal` |
| `subcontractor@demo.construction` | Al Waha | Portal subcontractor | `construction_portal` |

The roles nest: Director implies PM implies Engineer and QS implies Site
User. So **test downward** — if you want to know what an engineer cannot
see, log in as `yusuf.engineer`, not as `omar.pm`.

---

## What each one is for

**`samir.site` — the foreman.** The product from below the approval chain,
which is where most of its users sit. My Day should show his own defects and
tasks and nothing commercial. He should not be able to certify anything.

**`yusuf.engineer` — the site engineer.** Raises RFIs, issues drawings,
signs off ITP points. He can *read* the commercial documents but not author
them — see the matrix below, which is the house pattern rather than an
oversight.

**`nadia.qs` — the quantity surveyor.** This is the seat that owns the new
commercial documents. She is the first signature on both retention releases
and advance payments. Commercial Exposure and the CVR screens are hers.

**`omar.pm` — the project manager.** Second signature on a large retention
release. Sees both the engineering and the commercial sides.

**`hala.director` — the construction director.** Final signature on anything
large. Use her to clear an approval chain end to end.

**`layla.fm` — the facilities manager.** The whole FM half: assets, PM
calendar, work orders, SLA, contracts. My Day should show her work orders
and PM due — *not* construction RFIs.

**`tariq.tech` — the technician.** Deliberately only `base.group_user`. He
can close work orders and record meter readings but must not be able to
reconfigure assets or delete evidence; `facility_asset`'s tests assert
exactly that. Use him to check the product is not accidentally generous.

### The access matrix, as it actually is

Measured on a demo database rather than read off the ACL file. `rw` = read
and write, `r-` = read only, `--` = no access at all.

| | Retention release | Advance | Transmittal | ITP | ITP sign-off |
|---|---|---|---|---|---|
| `nadia.qs` | **rw** | **rw** | r- | r- | rw |
| `yusuf.engineer` | r- | r- | **rw** | **rw** | rw |
| `samir.site` | r- | r- | r- | r- | rw |
| `omar.pm` | rw | rw | rw | rw | rw |
| `layla.fm` | — | — | — | — | — |
| `tariq.tech` | — | — | — | — | — |

Three things worth reading off it:

- **Reading is broad, authoring is not.** Anyone on the construction side
  can see a retention release; only the commercial seat can raise one. That
  is the same shape as the BOQ and the payment certificate, and it is
  deliberate — a site engineer who cannot see the commercial position argues
  from guesswork.
- **The two halves are properly separated.** Facilities users have no access
  to construction documents at all, and vice versa.
- **A foreman can raise an ITP sign-off.** That is intentional: the site
  requests the inspection. What he cannot do is release a hold point without
  evidence — that is enforced in the workflow, not the ACL, so check it in
  step 6 of the tour rather than in this table.

---

## Set 2 — the two-company acceptance dataset (opt-in)

`majal_demo` installs a second company and nine role personas mapped to the
configurable access levels, including scoped construction-only and
facilities-only users. Install it deliberately:

```bash
odoo -d <db> -i majal_demo --stop-after-init
```

| Login | Role | Scope |
|---|---|---|
| `demo.owner@majal.local` | Platform Owner | both |
| `demo.admin@majal.local` | Company Administrator | both |
| `demo.ops@majal.local` | Operations Manager | both |
| `demo.pm@majal.local` | Project Manager | construction |
| `demo.engineer@majal.local` | Site Engineer | construction |
| `demo.field@majal.local` | Field User | construction |
| `demo.fm.manager@majal.local` | Facility Manager | facilities |
| `demo.fm.supervisor@majal.local` | FM Supervisor | facilities |
| `demo.tech@majal.local` | Technician | facilities |

Use this set when testing **tenant isolation and industry scoping** — a
construction-scoped user should not see the facilities company's data at
all. Use Set 1 for everyday feature testing; it is lighter and lives on one
company.

---

## A five-minute tour of the Phase 5 commercial documents

All on **Al Noor Tower**, which the demo data sets up deliberately so each
screen has something to show rather than an empty register.

1. **As `nadia.qs`** — Commercial → *Advance Payments*.
   `PRJ001-ADV-0001`: 1,059,200 advanced, **871,800 already recovered** from
   the first certificate at 20% of certified work, 187,400 outstanding. The
   guarantee is live. Print it (⚙ → Advance Payment Certificate).

2. **Commercial → *Retention Releases*.** `PRJ001-RRC-0001`: 435,900 held by
   the certificates, releasing half. The **amber banner** says it is being
   claimed before taking-over — that is deliberate demo state, not an error.
   Submit it and watch it route to her own approval step first.

3. **Try to break it.** Open the release, set the amount above 435,900 and
   submit. It refuses. That guard is an `@api.constrains`, so it also holds
   against an import or a server action.

4. **As `yusuf.engineer`** — Engineering → *Transmittals*.
   `PRJ001-TRN-0001` was issued to the consultant three weeks ago and carries
   a revision that has been **superseded since** — the amber banner is the
   point of the register. Print it: the PDF has a signature block, because a
   transmittal is a cover note that comes back signed.

5. **Try to rewrite history.** On that issued transmittal, change the
   recipient or the drawings. It refuses — cancel and reissue instead.

6. **Site Work → *Inspection & Test Plans*.** `PRJ001-ITP-0001` has five
   points, three of them hold points. Open the sign-off for *Reinforcement
   inspection before pour* and press Release with nothing attached: refused,
   because a hold point stops the work. Now put a reason in the Waiver box
   and release — allowed, and the chatter records who authorised it.

7. **As `samir.site`** — My Day shows his own defects and tasks. He can open
   the commercial registers read-only, but the Submit and Release buttons
   are not his to press.

8. **As `layla.fm`** — none of the above exists. My Day shows work orders and
   planned maintenance instead. This is the screen that used to fail
   outright for a facilities user; if it loads, that fix is holding.

Steps 3, 5 and 6 were each verified against a freshly installed demo
database, as were the three PDFs. If any of them behaves differently on
yours, something has regressed — they are not aspirational.

---

## Resetting

Demo data is created at install. To get a clean copy, install a fresh
database rather than trying to undo edits:

```bash
./scripts/run-local.sh -d majal_demo_fresh -i construction_ui,facility_asset --stop-after-init
./scripts/run-local.sh -d majal_demo_fresh --http-port=8069
```
