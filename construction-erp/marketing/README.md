# Majal marketing collateral

Posters, a brochure and a pitch deck, built from one palette, one type system
and one grid so the whole set reads as one company. The visual philosophy is
in [`DESIGN-PHILOSOPHY.md`](DESIGN-PHILOSOPHY.md) ("Load Path").

Everything is generated. Nothing is hand-placed, so a correction is a code
change and the whole set stays consistent.

```bash
cd construction-erp/marketing
python3 src/build.py          # crops, checks layout, exports, verifies
python3 src/check.py          # the layout guard on its own
```

## What is here

### `posters/` — six pieces, one idea each

| File | Size | The one idea |
|---|---|---|
| `majal-poster-a3-tender-to-handover-en.png` | A3, 3508 × 4961 px (300 dpi) | The commercial spine: six stages, six shipped modules, one contract value. |
| `majal-poster-a3-tender-to-handover-en-print-cmyk-3mm-bleed.pdf` | 303 × 426 mm | The same, CMYK with bleed and trim marks. |
| `majal-poster-a3-tender-to-handover-ar.png` | A3, 3508 × 4961 px (300 dpi) | The same spine, **composed right-to-left** — mirrored spine, mirrored leading edge, Arabic display type. |
| `majal-poster-a3-tender-to-handover-ar-print-cmyk-3mm-bleed.pdf` | 303 × 426 mm | The same, CMYK with bleed and trim marks. |
| `majal-social-1080x1350-bim.png` | 1080 × 1350 | "Colour everything, say nothing." The BIM before/after. |
| `majal-social-1080x1350-approvals.png` | 1080 × 1350 | "The check is in the method." Enforcement, and the inbox it makes possible. |
| `majal-banner-1920x1080-exposure.png` | 1920 × 1080 | "Waiting for a signature." Portfolio commercial exposure. |
| `majal-social-1080x1350-my-day.png` | 1080 × 1350 | "A day that fits on a phone." The field. |

### `brochure/` — six A4 pages

`majal-brochure-a4.pdf` (screen) and
`majal-brochure-a4-print-cmyk-3mm-bleed.pdf` (CMYK, 216 × 303 mm).

1. **Cover** — bilingual; the Arabic block is composed from the right edge.
2. **What it is** — the middle layer, and who it is for.
3. **The commercial spine** — six stages, with the bill it starts in.
4. **Control and the field** — approvals, My Day, raising a defect on a phone.
5. **BIM and facilities** — three shading modes, and the limits, stated.
6. **Running it** — deployment, recovery, open-source posture, next step.

### `deck/` — fourteen 16:9 slides

`majal-pitch-deck-16x9.pdf`, 960 × 540 pt = 1920 × 1080 px at 2×.

Problem → what it is → who for → how it works → capability map → the BIM
before/after → BIM limits → control and audit → mobile and field → facilities
→ open source and self-hosting → roadmap → the ask.

## The system

| | |
|---|---|
| Ground | `#173240` nav, with a single slow rake of `#244657` |
| Structure | `#346d75` primary, `#295a61` primary-dark |
| Accent | `#c59b52` — marks only; never sets body copy, never on white |
| Paper | `#f4f6f7` page, `#ffffff` surface |
| Ink | `#263842` text, `#4d616c` secondary, `#687983` muted, `#4a6a78` whisper |
| Display | **Big Shoulders** — condensed, architectural, set tight |
| Reading | **Instrument Sans** |
| Notation | **IBM Plex Mono** — reference markers, units, module names only |
| Arabic | **IBM Plex Sans Arabic** — shaped and reordered before it reaches the PDF |
| Grid | 6 pt baseline unit; every vertical measure is a multiple of it |

Print items are exported with hand-set CMYK separations (total ink held under
300 %), 3 mm bleed and 3 mm trim marks. Screen items are exported at exact
pixel dimensions and verified against them.

## Screenshots

Real captures of the running product, copied into `assets/img/raw/` and cropped
by `src/prepare_images.py`. Crops remove dead space below content; they never
remove a caveat, and no image is stretched, tilted, retouched or given a fake
device frame.

| Prepared crop | Used on |
|---|---|
| `dashboard` | brochure p2, deck 03 |
| `exposure` | banner |
| `exposure-tiles` | A3 poster (EN) |
| `rtl-tiles` | A3 poster (AR) |
| `boq` | brochure p3, deck 05 |
| `approval-inbox` | approvals poster, brochure p4, deck 09 |
| `my-day` | brochure p4, deck 10 |
| `defect-mobile` | My Day poster, brochure p4, deck 10 |
| `bim-original`, `bim-legend`, `bim-viewer` | BIM poster, brochure p5, deck 07 |

**`shot-asset-tag.png` is not used anywhere.** It does not show an asset record
with its QR/NFC tag — it shows an Odoo *Missing Action* error dialog for
`facility_asset.action_facility_equipment`. Placing it would mean showing a
broken screen, so the asset-tag capability is carried by typography instead
(deck slide 11). Replace the capture and it can be placed.

## Claim boundaries

Held to the same line as `construction-erp/website/`:

- **No social proof.** No customer names, logos, testimonials, case studies,
  ratings or "trusted by" rows appear anywhere in this set.
- **No invented statistics.** Every number is verifiable from the repository —
  37 modules (`custom-addons/*/`), 35 LGPL-3 + 2 AGPL-3 (`__manifest__.py`),
  6 wired document types, 7 recovery slots, 6 roles, 12 capability tiers,
  BCF 2.1, the 2000-clash cap and the 300 MB index cap (`docs/bim.md`).
  Figures visible inside screenshots are the shipped demo dataset and are
  labelled as such.
- **No pricing**, and nothing implies a hosted demo is live.
- **BIM limits are stated wherever BIM is mentioned** — bounding-box clash
  rather than triangle-precise, no IFC writing, no DWG — set in the same type
  as the capabilities, not in a footnote.

## The layout guard

Every mark a surface makes is recorded, and `src/check.py` reports any line of
type or any screenshot that strays outside its safe area. It runs before
export; if it fails, nothing is written. It caught three real defects that
survived visual review — a spine running off the left trim, a caption over the
right margin, and a module name overrunning its column.
