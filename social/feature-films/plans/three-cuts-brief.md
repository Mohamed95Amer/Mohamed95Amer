# Hyperframes Composition Brief: Get Gold, three cuts

## Objective
Build three concept-first launch films for Get Gold, each 36–40 s:
- **both:** buyers and jewellers together
- **customers:** buyers only
- **vendors:** jewellers only

Every cut explains what Get Gold is and how it works before showing features. Each one keeps the Odoo-20 feature-film motion language from `brag-output-2026-10-28-113924`.

## Output
| Cut | Composition | Video | Length | Music |
|---|---|---|---|---|
| Both sides | `both/composition/` | `both/brag.mp4` | 40.0 s | vol-11 |
| Customers | `customers/composition/` | `customers/brag.mp4` | 36.0 s | vol-11 |
| Vendors | `vendors/composition/` | `vendors/brag.mp4` | 37.0 s | vol-9 |

Format: landscape, 1920x1080, 30 fps.

## How it is built
- One scene library generates all three projects: `work/gen3.mjs` (markup), `work/lib.js` (timeline) and `work/style.css` + `work/style-new.css`. Run `node work/gen3.mjs` to regenerate.
- Each scene is authored in its own time base and added to the cut's paused master timeline as a child timeline at that cut's start. Scene starts sit on the 114.84 BPM beat lattice, which vol-11 and vol-9 share, so the beat-grid moments inside a scene stay on the beat in every cut.
- The master timeline owns the transitions between scenes: a whip with a directional SVG blur, a zoom-fade into the light scenes, and an iris with a gold rim into the end card.
- Each cut has its own pre-extracted audio data. Bass and treble drive the glow through CSS variables, set once per frame.

## Scene library
| Scene | Content | Used in |
|---|---|---|
| hook | Icon orbit, 3D ring, GET GOLD slam on the 1.60 s strong beat, then the tagline (vendors: "Bring your store online.") | all |
| hub | What Get Gold is: jewellers → Get Gold with the live price → buyers, with drawn wires and flowing gold dots | all, with copy per audience |
| lanes | How it works. Two swimlanes (both), "Six clear steps" (customers) or "Live in four steps" (vendors). A gold token travels the steps on the beat. | all |
| compare | GetGold Compare: chapter card, the four store cards, rank by "Lowest final total", magnifier, sticker | both, customers |
| size | Size guide, ring matched to EU 54, "Save as my size" | customers |
| request | Get Gold Request form, typing, three offers | customers |
| split | Buyer sends a request → it flies into the jeweller's "Buyer requests" → "Create an offer for this buyer" → "Send offer" → the offer flies back with "Accept this offer" | both, vendors |
| pieces | "Add your pieces": AI quick capture of a tray photo into six drafts, Excel/CSV 1–200 rows, "Nothing is published until you review it." | both, vendors |
| grid | Tilted feature-tile grid with a marker headline (customer tiles or vendor tiles) | customers, vendors |
| founding | Seal stamp "Free for life", three ticks, "You keep what you sell.", sticker "Founding places are limited." | both, vendors |
| end | Wordmark on a strong cue, plus CTAs per audience and the Arabic calligraphy line | all |

## Visual identity
- Colours: jade #072F28 / #104D36 / #17654F, gold #E9BD50 / #D69B2D / #B97820, bone #FCFAF7 / #F4EFE4, ink #202722.
- Fonts (all local woff2): Gelasio, Figtree, Caveat, Aref Ruqaa, IBM Plex Sans Arabic.

## Grounding
- Customer copy comes from the live site's home, how-it-works, compare, size-guide, requests and live-price pages, and from the app's labels in `src/`.
- Vendor copy comes from `/founding-stores` and `/vendors`, and from the vendor workspace and offer-form labels in `src/app/vendor`. The tool facts (Excel/CSV 1–200, quick capture with AI, review before publishing, Accept or Keep original) come from the live-site research of 15 Oct.
- Illustrative only:
  - Store A–D
  - offer amounts
  - AI category suggestions
  - the three spreadsheet rows (the first row is the app form's own placeholder)

## Audio
- Music at volume 0.34, with a 0.3 s fade-in and a 0.9 s fade-out.
- SFX on tracks 11 and up, matched to motion: clicks, keys, drops, card slides and shoves, glass ticks, soft impacts for stickers, and bells for the wordmarks.
- Beat locks:
  - all cuts: the hook at 1.60 s;
  - every scene start sits on a beat;
  - the end-card wordmark lands on a strong cue: 35.81 s (both), 33.18 s (customers), 34.76 s (vendors).
- Beat grids: the hub items, step nodes, compare cards, detection boxes, offer fields, founding ticks and grid tiles all land on half-beats or beats.

## Gate
`npx hyperframes check` must pass with zero errors in each `<cut>/composition/` before rendering.
