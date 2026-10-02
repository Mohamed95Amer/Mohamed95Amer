# GetGold.ae: 24-second vertical reel

A 24.0 s, 9:16 motion advertisement for Instagram Reels, TikTok and Facebook Reels.
It renders at 1080 × 1920 and 30 fps (720 frames). One deterministic timeline
(`reel.js`, `renderAt(t)`) drives both the browser preview and the MP4 export,
so their timing is identical.

Central message: **UAE jewellers. One marketplace.**

## Status

**Draft.** The framework, timing, copy, layout, soundtrack and export are done.
Three supplied assets are still missing. The first two appear as labelled
placeholders in the preview and in any exported MP4:

| Slot | Used in | Now |
| --- | --- | --- |
| Gold ring product photo | Scenes 1–2 | Placeholder |
| GetGold marketplace screenshot (mobile, portrait) | Scene 3 | Placeholder |
| Official logo file (SVG or transparent PNG) | Every scene, discreet top-left, then the end lockup | Interim: the "GET GOLD" wordmark set in a serif (Gelasio), as the website header renders it |

In use now: the bangle, necklace and earrings from the getgold.ae homepage
photograph (`public/images/uae-heritage-hero.webp`). They are cropped for each
card but not otherwise altered.

Not used: the earlier October motion pieces in `public/social/2026-10/`. They
show illustrated jewellery with store names and prices, which this brief rules
out.

## Adding the missing assets

1. Put the files in `assets/slots/`.
2. Set the paths in `config.js`:
   ```js
   logo: "assets/slots/logo.svg",
   ring: "assets/slots/ring.png",
   ringFit: "cover",          // "contain" for a transparent cut-out
   screenshot: "assets/slots/marketplace-mobile.png",
   ```
3. Run `node qa.mjs`, then `node export.mjs`.

The screenshot is shown at 438 px wide inside an upright, front-facing phone,
with no perspective. A capture taller than the screen (iPhone aspect,
1170 × 2532) scrolls once, gently, between 8.7 s and 10.6 s, by up to 560 px.
A capture that fits exactly does not scroll.

The preview page also has "Try a file" buttons, so you can see an asset in
place before you edit `config.js`. Those files stay in the browser tab.

## Run it

Needs Node 18+, ffmpeg on the PATH, and Playwright with Chromium.

```bash
npm install          # installs playwright (skip if it is installed globally)
npm run preview      # http://127.0.0.1:4173
npm run qa           # frame-by-frame checks + qa/contact-sheet.jpg
npm run export       # dist/getgold-reel-24s.mp4 (+ soundtrack WAV and report)
```

To use an existing Chromium, set `CHROMIUM_PATH=/path/to/chrome`.

`index.html` is written as page content, without `<html>`/`<head>`/`<body>`,
because the published artifact adds that skeleton. The local server
(`tools/common.mjs`) adds the same skeleton. Open the page through the
server, not as a `file://` URL.

## Storyboard and timing

| Time | Scene | On screen | Copy |
| --- | --- | --- | --- |
| 0.0–3.0 | 1 The hook | Large ring photo, gentle 5.5% push-in; logo top-left from frame one | "Your next gold piece?" (in 0.25 s, out by 2.95 s) |
| 3.0–7.0 | 2 Discovery | Ring settles into a grid; bangle (3.2 s) and necklace (3.4 s) join; settled by 4.0 s | "Discover your style." (3.35–6.85 s) |
| 7.0–12.0 | 3 The marketplace | Upright phone with the marketplace screenshot; one short scroll if the capture allows | "UAE jewellers. / One marketplace." (7.3–11.75 s) |
| 12.0–17.0 | 4 Exploration | Horizontal browse: earrings → bangle → necklace | "Explore the collection." (12.2–14.4 s), then "Find your next piece." (14.6–16.85 s) |
| 17.0–24.0 | 5 Brand and action | Three jewellery images, logo, "getgold.ae", charcoal "Explore now" button; settled by 18.45 s, held still to 24.0 s, no fade | "getgold.ae" · "Explore now" |

Each headline leaves completely before the next one enters. Moves use
ease-in/ease-out curves of 0.35–0.65 s. Everything is translation, opacity and
gentle scale: no rotation of flat photos, no morphing, no perspective.

## Safe areas

Critical copy and branding stay inside x 162–918 and y 288–1498: the central
70% of the width (which also keeps the right 15% clear), below the top 15% and
above the bottom 22%. `qa.mjs` checks this on every frame. It also checks for
two headlines on screen at once, text over imagery, clipped text, unloaded
images and empty frames, and that the end card is static from 19.0 s. The
preview has a "Show safe areas" toggle. These are conservative margins, so
still check the final file in each platform's own upload preview.

## Typography and colour

- Manrope 400 and 600 (SIL OFL, bundled in `assets/fonts/`). Headlines are
  600 at 90 px, the URL is 400 at 70 px, and the button label is 600 at 44 px.
- Interim wordmark: Gelasio 400 (SIL OFL). It is a free stand-in for Georgia,
  which the site's serif stack shows.
- Warm ivory ground (`#F6F0E6` with a soft radial lift), charcoal type and
  button (`#202722`, the site's ink), and champagne-gold rules (`#B08F55`).

## Sound

`soundtrack.js` renders one continuous original instrumental with the Web Audio
API (OfflineAudioContext). It has warm pads, a soft electric pluck, sub bass,
and light percussion that enters at the 3.0 s cut. It runs at 120 BPM, so every
scene change falls on a beat. There are three restrained cues: soft swells into
7.0 s and 12.0 s, and a chime at 17.9 s. The mix targets about −14 LUFS with
peaks at or below −1 dBFS. Because the code generates every sound, the track
needs no music licence.

To use other music, set `music` in `config.js`. It replaces the generated track
and is cut to 24 s with a 1.4 s tail fade.

### Voiceover (optional, not included)

No voiceover is recorded. To add one, record it, set `voiceover` (and
`voiceoverStart`, default 1.0 s) in `config.js`, and export again. The music
dips 6 dB under it.

Female, English, natural delivery. Say "A E" as two separate letters. Finish by
21.0 s. Do not add it as subtitles.

| Window | Line |
| --- | --- |
| 1.0–3.2 s | "Looking for your next gold piece?" |
| 4.0–9.8 s | "Explore jewellery from UAE shops, all in one marketplace." |
| 17.6–20.8 s | "Discover your style at Get Gold dot A E." |

If the recording is one file timed from 0.0 s, set `voiceoverStart: 0`.

## Files

| File | Role |
| --- | --- |
| `index.html` | Player page: the ad stage plus the controls and panel outside it |
| `config.js` | Asset slots |
| `reel.js` | Stage build and the timeline (`renderAt`) |
| `soundtrack.js` | Generated music, cues and mixing |
| `player.js` | Play/Pause, Replay, Mute, scrubber, asset previews |
| `qa.mjs` | Frame-by-frame checks and stills |
| `export.mjs` | MP4 render and verification (duration, size, frames, audio, loudness) |
| `tools/common.mjs` | Local server and browser launch |

## Guardrails kept

There are no prices, discounts, delivery promises, authenticity or investment
claims, vendor names, reviews, certifications, stock levels or checkout states.
Nothing suggests that GetGold makes or owns the jewellery. All copy is real
text set in code.
