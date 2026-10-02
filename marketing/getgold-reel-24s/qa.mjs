// Frame-by-frame checks on the timeline, plus stills of the key moments.
//   node qa.mjs            -> writes qa/report.json and qa/contact-sheet.jpg
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openReel, ROOT } from "./tools/common.mjs";

const OUT = path.join(ROOT, "qa");
fs.mkdirSync(OUT, { recursive: true });

const EXPECTED = {
  "Your next gold piece?": [0, 3],
  "Discover your style.": [3, 7],
  "UAE jewellers. One marketplace.": [7, 12],
  "Explore the collection.": [12, 14.5],
  "Find your next piece.": [14.5, 17],
};
const STILLS = [0, 1.2, 3.2, 3.5, 5.0, 7.1, 9.6, 12.1, 13.0, 13.8, 15.5, 16.95, 17.4, 17.8, 19.0, 23.967];

const reel = await openReel();
const { page } = reel;
const meta = await page.evaluate(() => ({
  frames: REEL.FRAMES,
  fps: REEL.FPS,
  safe: REEL.SAFE,
  slots: REEL.state.slots,
  warnings: REEL.state.warnings,
}));

const failures = [];
const fail = (msg) => failures.push(msg);
const S = meta.safe;
const firstSeen = {};
const lastSeen = {};
let finalState = null;

// Walk every frame (and the very end) through the same renderAt the exporter uses.
const samples = await page.evaluate(() => {
  const out = [];
  const stageEl = document.getElementById("stage");
  for (let f = 0; f <= REEL.FRAMES; f++) {
    REEL.seekFrame(f);
    const d = REEL.describe();
    // Visual content on screen: cards and the phone.
    let visual = 0;
    stageEl.querySelectorAll(".card, .phone").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.25) return;
      const r = el.getBoundingClientRect();
      if (r.right > 0 && r.left < 1080 && r.bottom > 0 && r.top < 1920) visual++;
    });
    // Copy or logo drawn over a card or the phone (text over imagery).
    const boxes = [];
    stageEl.querySelectorAll(".card, .phone").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.02) return;
      boxes.push({ id: el.id, r: el.getBoundingClientRect() });
    });
    const overlaps = [];
    for (const e of d) {
      if (e.opacity <= 0.01) continue;
      const a = { left: e.rect.x, top: e.rect.y, right: e.rect.x + e.rect.w, bottom: e.rect.y + e.rect.h };
      for (const b of boxes) {
        if (a.left < b.r.right && a.right > b.r.left && a.top < b.r.bottom && a.bottom > b.r.top) overlaps.push(`${e.copy} / ${b.id}`);
      }
    }
    const imgs = [...stageEl.querySelectorAll("img")].filter((i) => !(i.complete && i.naturalWidth > 0)).length;
    out.push({ f, d, visual, brokenImgs: imgs, overlaps });
  }
  return out;
});

for (const { f, d, visual, brokenImgs, overlaps } of samples) {
  const t = f / meta.fps;
  const headlines = new Set();
  for (const e of d) {
    if (e.opacity <= 0.01) continue;
    if (e.kind === "copy" && e.copy in EXPECTED) {
      headlines.add(e.copy);
      firstSeen[e.copy] ??= t;
      lastSeen[e.copy] = t;
    }
    if (e.kind === "copy" && !(e.copy in EXPECTED)) {
      firstSeen[e.copy] ??= t;
    }
    const r = e.rect;
    if (r.x < S.left - 0.5 || r.x + r.w > S.right + 0.5 || r.y < S.top - 0.5 || r.y + r.h > S.bottom + 0.5) {
      fail(`t=${t.toFixed(2)} "${e.copy}" outside the safe area: ${JSON.stringify(r)}`);
    }
    if (e.clipped) fail(`t=${t.toFixed(2)} "${e.copy}" is clipped`);
  }
  if (headlines.size > 1) fail(`t=${t.toFixed(2)} two headlines on screen: ${[...headlines].join(" | ")}`);
  if (visual === 0) fail(`t=${t.toFixed(2)} no jewellery or phone on screen (empty frame)`);
  if (overlaps.length) fail(`t=${t.toFixed(2)} text overlaps imagery: ${overlaps.join(", ")}`);
  if (brokenImgs) fail(`t=${t.toFixed(2)} ${brokenImgs} image(s) not loaded`);
  const logo = d.find((e) => e.kind === "logo");
  // The logo is on screen throughout, except its crossfade into the end lockup.
  const crossfade = t > 16.94 && t < 18.1;
  if (!logo || (!crossfade && logo.opacity < 0.99)) fail(`t=${t.toFixed(2)} logo not fully visible`);
  if (f === meta.frames) finalState = d;
}

for (const [copy, [a, b]] of Object.entries(EXPECTED)) {
  if (firstSeen[copy] == null) fail(`"${copy}" never appears`);
  else if (firstSeen[copy] < a - 1e-6 || lastSeen[copy] > b + 1e-6)
    fail(`"${copy}" visible ${firstSeen[copy].toFixed(2)}-${lastSeen[copy].toFixed(2)} s, outside ${a}-${b} s`);
}

// End card: settled by 19.0 s and unchanged through the last frame.
const key = (d) => JSON.stringify(d.map((e) => [e.copy, e.opacity, e.rect]));
const finalKey = key(finalState);
for (const { f, d } of samples) {
  if (f / meta.fps >= 19.0 - 1e-9 && key(d) !== finalKey) {
    fail(`t=${(f / meta.fps).toFixed(2)} end card still moving after 19.0 s`);
    break;
  }
}
for (const copy of ["getgold.ae", "Explore now"]) {
  const e = finalState.find((x) => x.copy === copy);
  if (!e || e.opacity < 0.999) fail(`"${copy}" not fully visible on the final frame`);
}

// Stills.
const stills = [];
for (const t of STILLS) {
  await page.evaluate((t) => REEL.renderAt(t), t);
  const file = path.join(OUT, `still-${t.toFixed(2).padStart(5, "0")}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  stills.push(file);
}
await page.evaluate(() => REEL.renderAt(0));

// Contact sheet, 8 x 2, each still labelled with its time.
const args = ["-y", "-loglevel", "error"];
stills.forEach((s) => args.push("-i", s));
const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const labelled = stills
  .map((s, i) => {
    const txt = STILLS[i].toFixed(2) + "s";
    const draw = fs.existsSync(font)
      ? `,drawtext=fontfile=${font}:text='${txt}':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`
      : "";
    return `[${i}:v]scale=270:480${draw}[v${i}]`;
  })
  .join(";");
const tile = stills.map((_, i) => `[v${i}]`).join("") + `xstack=inputs=${stills.length}:layout=` +
  stills.map((_, i) => `${(i % 8) * 270}_${Math.floor(i / 8) * 480}`).join("|") + "[out]";
args.push("-filter_complex", labelled + ";" + tile, "-map", "[out]", "-frames:v", "1", "-q:v", "3", path.join(OUT, "contact-sheet.jpg"));
execFileSync("ffmpeg", args);

const report = {
  checkedFrames: samples.length,
  slots: meta.slots,
  notSupplied: Object.entries(meta.slots).filter(([, v]) => !v).map(([k]) => k),
  warnings: meta.warnings,
  consoleErrors: reel.errors,
  headlineWindows: Object.fromEntries(Object.keys(EXPECTED).map((c) => [c, [firstSeen[c], lastSeen[c]]])),
  endCopyFirstSeen: { "getgold.ae": firstSeen["getgold.ae"], "Explore now": firstSeen["Explore now"] },
  failures,
};
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
await reel.close();

console.log(JSON.stringify({ ...report, failures: failures.slice(0, 40), failureCount: failures.length }, null, 2));
process.exit(failures.length || reel.errors.length ? 1 : 0);
