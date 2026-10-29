# Hyperframes Composition Brief: Get Gold

## Objective
Create a short, feature-launch brag video for Get Gold (getgold.ae) in the visual grammar of Odoo's "Meet Odoo 20's best features" film: cosmic orbit intro, chapter cards with line-art doodles, real UI in tilted 3D windows, yellow handwritten stickers, magnifier bubbles, simulated cursor and typing, whip pans, and a handwritten end card.

## Output
- Composition directory: `brag-output-2026-10-28-113924/composition/`
- Rendered video: `brag-output-2026-10-28-113924/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 24.5 seconds

## Source Material
- Project root: `/home/user/Mohamed95Amer` (the Get Gold Next.js app)
- Primary files read:
  - `src/components/CompareResults.tsx` (compare card labels and layout)
  - `src/lib/pricing/calc.ts` and `src/lib/pricing/value-score.ts` (price and score formulas)
  - `src/app/compare/page.tsx`
  - Live-site text captures of home, how-it-works, marketplace, size-guide, live-price, requests/new and founding-stores
- Product name: Get Gold (wordmark "GET GOLD", compare product "GetGold Compare")
- Tagline / strongest claim: "Bringing the UAE gold market online." / "نضع سوق الذهب الإماراتي على الإنترنت."
- Key UI moments to recreate:
  - Compare cards with breakdown and Value Score
  - Size guide result panel and "Save as my size"
  - Request form and offers
  - Feature grid
- Copy that must appear verbatim:
  - Bringing the UAE gold market online.
  - GetGold Compare · Smart cross-store comparison
  - Lowest final total · Estimated final total · Get Gold Value Score · Gold value · Making after discount · Get Gold fee · VAT (5%)
  - Every charge explained
  - Size guide · Find your ring, bangle or diamond size · International size (EU / ISO) · Save as my size (EU 54)
  - Get Gold Request · Can't find it? Let stores find it for you. · Send request to verified stores
  - Live gold prices · Clear breakdowns · Rechecked every 10s · 24K gold · market reference
  - نضع سوق الذهب الإماراتي على الإنترنت.
- Numbers (computed with the app's own formula at the 22 Oct 24K reference AED 482.65/g; 22K = 0.92; 10 g; Get Gold fee 1%; VAT 5%; store pickup):

  | Store | Making (AED) | Get Gold fee (AED) | VAT (AED) | Final total (AED) | Value Score |
  |---|---|---|---|---|---|
  | A · Dubai | 380 | 48.20 | 243.43 | 5,112.01 | 90 |
  | B · Sharjah | 520 | 49.60 | 250.50 | 5,260.48 | 87 |
  | C · Dubai | 290 | 47.30 | 238.88 | 5,016.56 | 92 |
  | D · Abu Dhabi | 450 | 48.90 | 246.96 | 5,186.24 | 89 |

  - Gold value is AED 4,440.38 for every store, at AED 444.04/g.
  - Sorted by lowest final total: C, A, D, B.
- Size: EU 54 = US 7 = Indian 14 = 17.3 mm diameter (size-guide chart).

## Creative Direction
- Tone preset: app-store, with cinematic bookends
- Creative direction: an Odoo 20 feature-launch film made by a motion designer showing off
- Interpretation:
  - Fast camera and transitions, with every cut on the beat.
  - The UI holds long enough to read the numbers.
  - The craft lives in depth, camera moves, stickers, the lens and the whips.
- Angle: keep Odoo's grammar and swap every noun for Get Gold's.
  - Purple space becomes jade night with gold dust.
  - App icons become jewellery and Get Gold feature icons.
  - The rocket doodle becomes a falcon and a dhow.
  - The yellow stickers become Get Gold's gold #E9BD50.
  - The UI is the real Get Gold UI.
- Hook: the icon orbit collapses into a spinning 3D gold ring and the GET GOLD wordmark on the first strong beat (1.60 s), with "Bringing the UAE gold market online."
- Outro / punchline: the jade night returns. The wordmark and the "getgold.ae" badge land on 22.65 s, and the Arabic line writes on in gold calligraphy.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Invented store names: use Store A–D, as the earlier showreel did
  - Purple

## Visual Identity
- Background: jade #072F28 (cosmic); bone #FCFAF7 / #F4EFE4 (cards, UI)
- Text: ink #202722 on light; bone #F4EFE4 on jade
- Accent: gold #E9BD50, with deep gold #D69B2D / #B97820; jade #104D36 / #17654F for UI chrome
- Display font: Gelasio (local woff2)
- Handwriting font: Caveat (stickers)
- Arabic fonts: Aref Ruqaa for the end line; IBM Plex Sans Arabic in the UI
- Body font: Figtree (local woff2)
- Visual references from the project:
  - The GET GOLD serif wordmark with the UAE flag stripe
  - Compare cards: rounded-2xl, the gold ring on the first card, the jade-50 final-total panel
  - Pre-rendered 3D gold ring (96-frame turntable) and gold band (72 frames)

## Storyboard
Use the storyboard in `brag-output-2026-10-28-113924/brag-plan.md` as the creative contract.

Scene summary:
1. Cosmic hook — 3.70 s — icon orbit, then ring and wordmark slam at 1.60, then the tagline.
2. GetGold Compare — 5.26 s
   - Chapter card with the falcon.
   - Tilted window; four cards land one per beat.
   - The cursor sorts by "Lowest final total" and Store C rises.
   - Magnifier on the breakdown, plus the "Every charge explained" sticker.
3. Size guide — 3.69 s
   - Chapter card with the dhow.
   - Band on screen, the circle grows, the size rolls to 54 with US 7 · Indian 14 · 17.3 mm.
   - The "Save as my size (EU 54)" click.
4. Get Gold Request — 5.26 s
   - Chapter card.
   - Chips select, the description types, the cursor clicks send.
   - Three offers arrive; "Send one request" sticker.
5. Everything else — 3.68 s
   - A tilted grid of eight feature tiles with the live gold-price sparkline.
   - "Live gold prices. Clear breakdowns." with a marker sweep.
6. End card — 2.91 s — orbit returns, wordmark and badge land at 22.65, the Arabic tagline writes on.

## Audio
- Audio role: rhythmic layer and warm bed.
- Audio arc: a build into the 1.60 drop. Each chapter rides a strong cue. The UI is scored with clicks and keys, the grid gives a lift, and the bell rings out as the music fades.
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3`
- Music treatment: volume around 0.34; 0.3 s fade-in; fade out over the last 0.9 s; the logo bell rings over it.
- Music cue guidance:
  - Preset: `.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.json` (114.84 BPM).
  - Strong-cue locks: 1.60, 17.91, 22.65.
  - Scene changes sit on 3.70, 8.96 and 12.65.
  - Beat-grid windows:
    - Cards 5.28–6.86
    - Sort click 7.38
    - Sticker 7.91
    - Size count 10.54–11.06
    - Save click 11.60
    - Chips 13.70 / 14.22 / 14.76
    - Send click 15.81
    - Offers 16.34 / 16.86 / 17.39
- Audio-reactive treatment: subtle. Bass breathes the jade glow and gold dust, and the gradient light behind the windows. Treble adds a soft gold glow on the wordmark. No visualizer graphics.
- Audio-coupled moments:
  - Logo slam: bell plus soft impact.
  - Whips: card slide.
  - Card landings: drop.
  - Sort and save: mouse click.
  - Reorder: shuffle.
  - Stickers: soft thud.
  - Typing: randomised keypress.
  - Offers: card slide.
  - Grid wave: card fan.
  - End card: bell.
- SFX selection guidance: prefer low and medium high-frequency-risk files from `sfx-analysis.md`. Score only the first and last of dense sequences, and keep SFX at 0.55–0.8.
- SFX analysis guidance: `.claude/skills/brag/assets/sfx/sfx-analysis.md`
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density and volume from the implemented animation.
- Audio files: copy the music and the chosen SFX into `composition/assets/`.

## Hyperframes Instructions
Requirements:
- Show real Get Gold UI with verbatim labels and app-formula numbers.
- Keep all text readable; land each text state sharp and hold it.
- 24.5 s total.
- Music and SFX are on.
- Beat-lock 1.60, 17.91 and 22.65; snap sequential events to the beat grid.
- Audio-reactive extraction with the hyperframes-creative helper, sampled per frame.
- Local assets only: GSAP from node_modules, fonts as local woff2, 3D renders as local sprite sheets.
- Use the motion-blur component on one to three snapping elements, and a directional blur on the whips.
- `npx hyperframes check` must pass before render.
