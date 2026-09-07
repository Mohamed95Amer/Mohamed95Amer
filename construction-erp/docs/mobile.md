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

### Phase 1 — fix the field screens (small, highest value) — **done**

- ~~Give the inspection checklist a card layout.~~ **Done.** The mechanism is
  worth knowing for the rest: Odoo's `loadSubViews` picks the `kanban`
  sub-view of a one2many whenever the screen is small, so a phone layout is a
  sub-view, not CSS and not JavaScript.
- ~~Same treatment for raising a defect.~~ **Done.** Not a sub-view this time,
  because the defect form is a top-level form with no small-screen variant to
  select. Groups stack on a phone, so the field order *is* the screen order,
  and the photo was tenth — below nine fields and a description, on a screen
  where the photo is the entire point of a snag. The raising path is now
  title → photo → location → severity → project → description, which measures
  as one screen at 390 × 664 with nothing below the fold; trade, phase, who
  fixes it and by when moved to an Assignment tab, and the rectified photo to
  a Rectification tab. The empty reference heading is hidden until save,
  where it was costing a third of a screen above the first thing you type.
- ~~Add `capture="environment"` to photo fields.~~ **Not done, deliberately.**
  The premise turned out to be wrong. Odoo 18 already appends an invalid
  `dummy/allowAndroidCamera` mimetype to the accept list, with a comment in
  `image_field.xml` saying it exists precisely so Android 13+ offers Camera
  instead of opening the gallery directly. That is the problem this bullet was
  written to solve, already solved upstream — and solved the other way round:
  `capture` does not add the camera, it removes everything else, leaving no
  way to attach a photo taken ten minutes earlier. If forcing the camera is
  ever wanted it should be for inspection evidence, where "taken now" is the
  point, and it should be an argued product decision rather than a blanket
  attribute on every photo field.
- ~~Add `web_responsive` to the install list.~~ **Done** — searchable app
  drawer and sticky list headers, verified installing cleanly alongside the
  other 34 modules.

### Phase 2 — make the installed app ours (small) — **done**

Mostly already built, and the audit found one thing that was wrong rather than
missing:

- The manifest override was in place: Majal name and short name, brand
  colours, description, `start_url` on the construction workspace rather than
  `/odoo`, and Construction/Facilities shortcuts for the long-press menu.
- **The maskable icon was declared, not drawn.** A single entry claimed
  `purpose: "any maskable"` while pointing at `icon.svg` — which has
  `rx="28"`, so a launcher's own mask turns its transparent corners into
  notches, and whose ground line runs from x=20 to x=108 at y=99, putting both
  ends 56 units from the centre when the safe circle has a radius of 51.2.
  Android would have sliced them off. There are now two entries: `icon.svg`
  for `any`, and `icon-maskable.svg` — full bleed, mark scaled to 0.78 about
  the centre — for `maskable`. A test parses the served SVG and asserts both
  properties, because the first version of that test matched the comment
  explaining the rule instead of the markup obeying it.

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
