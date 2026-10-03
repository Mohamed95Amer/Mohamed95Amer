# Mobile

Whether what has been built can be used on a phone, and what it would take to
make the mobile story a real one rather than a claim.

## The short answer

It works on a phone today, better than expected in the frame and worse than
expected in the content. Nothing overflows, everything stacks, and the app is
already installable to a home screen. What is missing is not responsiveness —
it is that the field screens truncate exactly the text a person on site needs
to read, and that "installable" is not the same as "works with no signal".

Nothing here needs a rewrite. It needs a decision about how far to go.

## What is true today

Measured in Chromium at an iPhone 13 viewport (390 × 664) against a running
instance, not inferred:

| Area | Measured | Verdict |
|---|---|---|
| Backend home | `scrollWidth` 390 = viewport 390 | No horizontal overflow |
| Defect list | 390 = 390 | Fits |
| Inspection form | 390 = 390, fields stack one per row | Genuinely usable |
| Portal (`/my`) | 390 = 390 | Fits — it is Bootstrap and always was |
| **Inspection checklist** | Was a table 577 px wide inside a 390 px screen, truncating questions to **"Wall finish…", "Ceiling tile…", "Door clos…"** | **Fixed in this change.** A kanban sub-view — which Odoo selects automatically below the small breakpoint — puts one question per card with its section above it and the answer as a badge, and tapping a card opens a form with radio buttons instead of a dropdown. |
| Header actions | Collapse behind the cog | Standard Odoo mobile behaviour; "Mark Rest as Yes" is two taps away rather than one |
| **PWA manifest** | Present, served at `/web/manifest.webmanifest` | Installable to the home screen today |
| **Service worker** | Registered and **active** | But see below — it caches one page |
| **3D BIM viewer** | Orbits by touch; **pinch-to-zoom was missing entirely** | Fixed in this change: pinch zooms, two fingers pan, page-zoom suppressed over the canvas |

Two things that had been assumed and turned out to be wrong, both worth
correcting because they change the plan:

- **A PWA already exists.** Odoo 18 ships the manifest and service worker; the
  vendored-but-uninstalled `web_pwa_oca` from the original plan is not needed
  for installability. What Odoo's manifest says, though, is `"name": "Odoo"`,
  an Odoo purple theme colour, Odoo icons, and `start_url: /odoo`. Installed to
  a phone, the product is called Odoo and opens on a generic backend root.
- **The service worker does not make anything work offline.** Its cache list is
  exactly `["/odoo/offline"]` — one page, whose entire job is to say "you are
  offline" instead of showing a browser error. No app shell, no data, no
  queued writes. Installable ≠ offline, and the gap between them is the whole
  of phase 3 below.

`web_responsive` (OCA) is vendored in `oca-addons/` but is **not** in the
install list in `scripts/init-db.sh`. It is not needed for the app to fit a
phone — Odoo 18 already does — but it improves the app menu and sticky list
headers, and it is free.

## What "mobile" should mean here

Three different asks get called "a mobile app", and they cost very different
amounts:

1. **It works on my phone.** Largely true today. Finish it by fixing the
   screens a person uses standing in a room.
2. **It is on my home screen and feels like our product.** Nearly true; it is
   branding and a start URL away.
3. **It works in a basement with no signal and syncs later.** Not true at all,
   and this is the expensive one — the one Fieldwire is actually bought for.

## Plan

### Phase 1 — fix the field screens (small, highest value)

- ~~Give the inspection checklist a card layout.~~ **Done in this change.** The
  mechanism is worth knowing for the rest: Odoo's `loadSubViews` picks the
  `kanban` sub-view of a one2many whenever the screen is small, so a phone
  layout is a sub-view, not CSS and not JavaScript.
- Same treatment for raising a defect: title, photo, location, severity are
  what a person fills standing in a room; the rest can collapse.
- Add `capture="environment"` to photo fields so the camera opens directly
  instead of the gallery picker.
- Add `web_responsive` to the install list — it is already vendored at a pinned
  SHA.

### Phase 2 — make the installed app ours (small)

- Override the web manifest: Majal name, short name, brand colours, icons, and
  `start_url` pointing at the field workspace rather than `/odoo`, so opening
  it lands on today's work rather than a menu.
- Add a maskable icon so Android does not letterbox it.

No new dependency: this is overriding what Odoo already serves.

### Phase 3 — offline (large, and a real decision)

Odoo's web client is not built to run offline, and its service worker caches a
single page. Anything genuinely offline needs a purpose-built surface for the
field workflows, talking to the same server.

The honest options, cheapest first:

- **Read-only offline.** Extend the service worker to cache the current
  project's open defects, today's inspections and the drawings behind them into
  IndexedDB. A site engineer can *see* their list in a basement. Perhaps a
  week, and it covers a surprising share of the real complaint.
- **Queued writes.** New defects, answered checklists and photos written to
  IndexedDB and posted when the connection returns, with a visible queue. This
  is where the real work is: photo storage limits, retry, partial failure, and
  deciding what happens when two people close the same defect. Weeks, not days.
- **A native shell** — Capacitor around the PWA. Buys camera and filesystem
  integration and a store presence. Worth it only if the store presence is
  itself the requirement; Capacitor around a working PWA is far cheaper than a
  second client, and a Flutter or React Native rewrite against a JSON-RPC API
  is a second product to maintain forever.

### What I would not do

Build a native app first. The portal already serves clients, consultants and
subcontractors — the majority of people who will ever open this on a phone —
and it measures clean at 390 px today. The group with a genuine offline need is
the site team snagging in a building with no signal, and that need is specific
enough to serve with a focused offline surface rather than a second copy of the
whole ERP.

### The BIM viewer on a phone

Worth stating separately, because it is the part most likely to disappoint.
web-ifc is a 6 MB WASM download before the model itself, and parsing happens on
the device. Pinch and pan now work, and a single-discipline model of one floor
is fine on a modern handset. A federated whole-tower model is not, and no
front-end work changes that — it would need server-side geometry tiling, which
is a project in its own right. On a phone, treat the viewer as "look at this
level"; coordination happens at a desk.
