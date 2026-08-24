# Images

## The logo

`majal-mark.svg` is the production Majal mark: a white geometric M/building
inside a rounded square that moves from Majal Aqua through Majal Teal to Majal
Deep Teal. It is deliberately vector-based so it stays sharp in navigation,
favicons and high-density displays.

Two source forms are kept in this directory and must stay in step if the mark
changes:

| Where | Form | Why |
|---|---|---|
| `majal-mark.svg` | compact vector with the official gradient | website header, favicon and scalable digital use |
| `majal-logo-master.png` | transparent, high-resolution raster master | previews and tools that cannot consume SVG |

Every public page references `/assets/img/majal-mark.svg` for both the header
mark and favicon. Do not paste independent inline copies into page markup.

The wordmark beside it is not a graphic — it is live text set in Big Shoulders
Bold, uppercase, from `assets/fonts/`.

# Screenshots

Drop the real PNGs into this directory using exactly these filenames. The pages
already reference them with `<img>` tags and captions; until the files land, the
CSS gives each figure a fixed aspect-ratio box with a neutral placeholder
background, so the layout does not move when they arrive.

## Capture notes

- **Home-page card shots** (`card-*.png`): these sit in a **16 : 7** box with
  `object-fit: cover`, so **capture them at 16 : 7 and crop them to 16 : 7**.
  A strip of a different ratio gets cropped a second time by the CSS, which is
  how these once ended up showing a meaningless middle slice with the numbers
  cut off mid-digit. Capture at a 1600 x 700 viewport at 2x, then trim the
  collapsed icon rail and the internal application top bar - neither says anything about the
  feature — keeping the result at 16 : 7.
- **Desktop shots**: capture at 1440 px wide or better, on a light background.
  The figure box is `16 / 10` by default (`.shot`) and `21 / 9` for `.shot.wide`.
  Images are `object-fit: contain`, so a slightly different ratio will letterbox
  rather than crop — but matching the ratio looks better.
- **Phone shots**: capture at a 390 px viewport (iPhone 13 width). These are
  referenced with `.shot.tall`, a `4 / 5` box.
- Use a demo database. Do not capture real client names, real contract values,
  real people or real email addresses.
- Interface language English unless the caption says otherwise.

## The files

| Filename | Where it is used | What it should show |
|---|---|---|
| `shot-bim-viewer.png` | `features.html` → BIM and IFC | The 3D BIM viewer with a model loaded in the **default** view: one neutral material with drawn edges, plus a handful of elements coloured by their worst open item. Storey filter and section-cut controls visible. Desktop. |
| `shot-bim-legend.png` | `insights/bim-colour.html` | The class legend beside the model — named classes ("Wall", "Slab", "Beam", "Column"), each with its colour swatch and element count, ordered by count, with the isolate control on each row. Desktop. |
| `shot-bim-original.png` | `insights/bim-colour.html` | The **same** model drawn in the colours written into the IFC by its authoring tool — many saturated hues at once, one per object class. This is the "confetti" counter-example; it should be recognisably the same building as `shot-bim-viewer.png`. Desktop. |
| `shot-approval-inbox.png` | `features.html` → Approvals and control | The "waiting for me" approval inbox: one list across document kinds (variation, bill of quantities, payment certificate, permit, daily log, inspection), each row showing the document, its value and which step of the chain it is at. Desktop. |
| `shot-my-day.png` | `index.html` | **My Day** at a 390 px viewport — a real phone capture, not a desktop one scaled down; it is shown in a 17 rem phone frame and a desktop screenshot there is unreadable. "Waiting for my approval" first, then defects, inspections, tasks, RFIs and permits with counts and late counts. Empty rows must not be drawn, so trim the dead scroll area below the last row. Phone. |
| `shot-dashboard.png` | `features.html` → Commercial | The executive portfolio dashboard with several projects selected: metric bars scaled across the selection, the certified-against-contract track, the value-against-cost stack, and the worst-first watchlist. Desktop. |
| `shot-defect-mobile.png` | `features.html` → Mobile and field | Raising a defect at a 390 px viewport, showing the corrected field order — title, photo, location, severity, project, description — with nothing below the fold. Phone. |
| `shot-boq.png` | `features.html` → Commercial | A bill of quantities: hierarchical sections with priced lines, the budget cost breakdown columns, section and sheet totals, and the approval state. Desktop. |
| `shot-exposure.png` | `index.html` | The **Commercial Exposure** report: contract value, approved variations with their percentage of contract, retention held, certified-not-invoiced, and below them the "Waiting for a signature" table ordered worst value first with days outstanding. Desktop. |
| `shot-asset-tag.png` | `features.html` → QR and NFC asset tags | Either the printable 70 × 50 mm QR/NFC label for a facility asset, or the authenticated mobile landing page a scan opens (asset code, warranty, open work, "confirm scan"). Phone-shaped, `4 / 5`. |
| `shot-retention-release.png` | `features.html` → Commercial | A retention release certificate: the withheld, already-released and available-to-release figures, and the release percentage. Desktop. |
| `shot-advance-payment.png` | `features.html` → Commercial | An advance payment certificate with the guarantee lapsed, showing the warning banner that the outstanding balance is unsecured, beside the recovery rate and amount still outstanding. Desktop. |
| `shot-plan-viewer.png` | `features.html` → Construction delivery | A drawing sheet in the plan viewer with pins dropped at specific points — the different pin types (task, RFI, defect, note) should be visibly distinct. Desktop. |
| `shot-transmittal.png` | `features.html` → Construction delivery | An issued transmittal: recipient, purpose, issue date, the drawing revisions it carries, and the banner warning that a carried revision has since been superseded. Desktop. |
| `shot-itp.png` | `features.html` → Construction delivery | An inspection and test plan listing its checks in sequence, with hold points marked distinctly from witness points. Desktop. |

## If a shot cannot be captured

Do not substitute a stock image or a mock-up. Remove the `<figure>` block from
the page instead, or replace it with a shot that shows something real — every
caption on the site describes the screen it sits next to, and a caption that
does not match what the reader is looking at costs more than a missing figure.
