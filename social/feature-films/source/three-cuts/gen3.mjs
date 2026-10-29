// Generates three Hyperframes compositions (both sides · customers · vendors) from one scene library.
// Static HTML + one paused GSAP master timeline per cut; loops here only expand markup.
import { writeFileSync, readFileSync, mkdirSync, cpSync, existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const FILM = new URL("../../brag-output-2026-10-28-113924/composition/", import.meta.url);

// ---------- helpers ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = (x) => Math.round(x * 100) / 100;
const words = (s) => s.split(" ").map((w) => `<span>${w}</span>`).join(" ");

const G = {
  ring: '<circle cx="12" cy="14.6" r="6.4"/><path d="M9.6 5.4 12 3l2.4 2.4L12 7.8z"/>',
  bangle: '<ellipse cx="12" cy="12" rx="8.6" ry="6.2"/><ellipse cx="12" cy="12" rx="5.6" ry="3.6"/>',
  chain: '<rect x="2.5" y="9" width="8.5" height="6" rx="3"/><rect x="13" y="9" width="8.5" height="6" rx="3"/><path d="M8.5 12h7"/>',
  earring: '<circle cx="12" cy="4.6" r="1.9"/><path d="M12 6.5v3.2"/><path d="M12 9.7 8 15.6a4 4 0 0 0 8 0z"/>',
  pendant: '<path d="M4 3.5c2 5 5 7.2 8 7.2s6-2.2 8-7.2"/><path d="M12 10.7v2"/><path d="m12 12.7-3.2 4 3.2 4 3.2-4z"/>',
  coin: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="5.4"/><path d="M12 9.5v5"/>',
  bar: '<path d="M6.5 8h11l3.2 9.5H3.3z"/><path d="M9.5 11.5h5"/>',
  diamond: '<path d="M7 4.5h10l4 4.8-9 10.7L3 9.3z"/><path d="M3 9.3h18M9.2 4.5 12 9.3l2.8-4.8M12 9.3V20"/>',
  scales: '<path d="M12 4v16M7 20h10M4.5 7h15"/><path d="m4.5 7-2.8 6a2.8 2.8 0 0 0 5.6 0z"/><path d="m19.5 7-2.8 6a2.8 2.8 0 0 0 5.6 0z"/>',
  shield: '<path d="M12 3 4.5 6v6c0 5 3.3 8 7.5 9 4.2-1 7.5-4 7.5-9V6z"/><path d="m8.6 12.2 2.4 2.4 4.4-4.8"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 20.2a2 2 0 0 0 4 0"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.6"/><path d="M6.5 8v3.2M10.5 8v4.4M14.5 8v3.2M18.5 8v4.4"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  store: '<path d="M4.5 10.5V20h15v-9.5"/><path d="M3 10.5 5 4h14l2 6.5z"/><path d="M10 20v-5h4v5"/>',
  chart: '<path d="M3 20.5h18"/><path d="m4 16 5-5 4 3 7-8"/><path d="M16 6h4v4"/>',
  plane: '<path d="M21 3 3 10.4l7 2.6 2.6 7z"/><path d="M10 13 21 3"/>',
  truck: '<path d="M2.5 6h11v10h-11z"/><path d="M13.5 9h4l3 3.5V16h-7"/><circle cx="6.5" cy="17.6" r="1.8"/><circle cx="17" cy="17.6" r="1.8"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 13.5h3"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v4.5h16V15"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>',
  sheet: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M3.5 14h17M9.5 4v16"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  tag: '<path d="M3 12V4h8l9.5 9.5-8 8z"/><circle cx="7.5" cy="8.5" r="1.6"/>',
};
const glyph = (k, cls = "glyph") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[k]}</svg>`;

const FALCON = `<svg viewBox="0 0 230 130" fill="none" stroke="#202722" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M32 74c30-10 72-13 110-7 20 3 37 0 50-8l13-5-7 11c-8 10-28 18-58 20-30 2-70 0-108-11z" fill="#FCFAF7"/><path d="M96 66c5-27 25-50 56-60-10 21-18 41-22 61" fill="#FCFAF7"/><path d="M112 68C92 44 72 26 40 17c15 21 30 38 50 52" fill="#FCFAF7"/><path d="M32 74 9 63l4 14-8 10 28-8"/><path d="M193 59c4-6 11-6 14-2"/><circle cx="197" cy="61" r="1.6" fill="#202722"/><path d="M120 20c4 10 6 22 6 34M136 14c-2 12-4 24-4 38"/></svg>`;
const DHOW = `<svg viewBox="0 0 270 190" fill="none" stroke="#202722" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 122 244 114c-8 26-30 38-70 40H72c-26-2-44-12-52-32z" fill="#FCFAF7"/><path d="M132 120 120 18"/><path d="M120 18c44 20 84 60 108 90L60 118c20-36 40-70 60-100z" fill="#FCFAF7"/><path d="M120 18 106 10l12-4"/><path d="M60 140h150"/><path d="M0 172q16-11 32 0t32 0 32 0 32 0 32 0 32 0 32 0 32 0"/></svg>`;

function starburst(points = 16, outer = 100, inner = 84, fill = "#E9BD50") {
  const p = [];
  for (let i = 0; i < points * 2; i++) { const r = i % 2 ? inner : outer; const a = (Math.PI * i) / points - Math.PI / 2; p.push(`${r2(100 + r * Math.cos(a))},${r2(100 + r * Math.sin(a))}`); }
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><polygon points="${p.join(" ")}" fill="${fill}"/></svg>`;
}
function stars(id, n, seed) {
  const R = mulberry32(seed); let s = "";
  for (let i = 0; i < n; i++) {
    const x = r2(R() * 1920), y = r2(R() * 1080), big = R() < 0.12, sz = big ? r2(3 + R() * 2.5) : r2(1.2 + R() * 1.8);
    const gold = R() < 0.45;
    s += `<i class="st" style="left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${gold ? "#F3D88A" : "#F4EFE4"};${big ? "box-shadow:0 0 10px 2px rgba(243,216,138,.55);" : ""}"></i>`;
  }
  return `<div id="${id}" class="stars" data-layout-ignore>${s}</div>`;
}
const ORBIT_ICONS = ["ring", "bangle", "chain", "coin", "bar", "diamond", "scales", "shield", "bell", "ruler", "pin", "store", "chart", "earring", "pendant", "truck"];
function orbit(id) {
  let arms = "";
  ORBIT_ICONS.forEach((k, i) => {
    const a = (360 / ORBIT_ICONS.length) * i, style = ["t-gold", "t-jade", "t-bone"][i % 3];
    arms += `<div class="arm" style="transform:rotateZ(${a}deg)"><div class="pos ${id}-pos"><div class="face ${id}-face" data-a="${a}"><div class="otile ${style} ${id}-tile">${glyph(k)}</div></div></div></div>`;
  });
  return `<div id="${id}" class="orbit-wrap" data-layout-ignore><div class="orbit-tilt"><div id="${id}-spin" class="orbit-spin">${arms}</div></div></div>`;
}
function chrome(url) {
  return `<div class="chrome"><span class="dots"><i style="background:#E06C5B"></i><i style="background:#E9BD50"></i><i style="background:#4FA57A"></i></span><span class="url"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#56625A" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>${url}</span></div>`;
}
// layered: the request page recedes behind floating offer cards, so its header text may sit under them by design
function siteHeader(active, layered = false) {
  const L = layered ? " data-layout-allow-overlap data-layout-allow-occlusion" : "";
  const nav = ["Shop", "GetGold Compare", "Gold price", "Stores", "How it works"].map((n) => `<span class="${n === active ? "on" : ""}"${L}>${n}</span>`).join("");
  return `<div class="sitehead"><span class="wm-sm"${L}>GET GOLD</span><nav>${nav}</nav><span class="ticker"><i class="live"></i><span class="tk-l"${L}>24K gold · market reference</span><b${L}>AED 482.65/g</b></span></div>`;
}
function cursor(id) {
  return `<div id="${id}" class="cursor" data-layout-allow-occlusion data-layout-ignore><span id="${id}-ring" class="cring"></span><svg viewBox="0 0 32 40" width="46" height="58"><path d="M3 2v31l8.4-7.6 5.2 11.8 5.6-2.5-5.2-11.6H28z" fill="#FCFAF7" stroke="#202722" stroke-width="2.4" stroke-linejoin="round"/></svg></div>`;
}
const studioBg = (id, seed) => `<div class="studio" data-layout-ignore><div class="studio-glow"></div><div class="studio-arc"></div>${stars(id, 46, seed)}</div>`;
const sticker = (id, cls, text, extra = "") => `<div id="${id}" class="sticker ${cls}" data-layout-allow-occlusion data-layout-allow-overlap${extra}>${text}</div>`;
const headblk = (eye, t, s, ink = false) => `<div class="headblk${ink ? " ink" : ""}"><p class="hb-eye">${eye}</p><h2 class="hb-t">${words(t)}</h2>${s ? `<p class="hb-s">${s}</p>` : ""}</div>`;

// Doodle flights: keyframes for the doodle's top-left corner, and a dotted trail through its tail point.
function makeFlight(n, fx, fy, tail, dir) {
  const pts = [], tp = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([r2(fx(u)), r2(fy(u))]); }
  pts.forEach((p, i) => { const q = pts[Math.min(i + 1, n)], o = pts[Math.max(i - 1, 0)]; p.push(r2(Math.atan2(q[1] - o[1], Math.abs(q[0] - o[0]) || 1) * 180 / Math.PI * 0.6 * dir)); tp.push([r2(p[0] + tail[0]), r2(p[1] + tail[1])]); });
  let d = `M${tp[0][0]} ${tp[0][1]}`;
  for (let i = 1; i < tp.length - 1; i++) { const mx = r2((tp[i][0] + tp[i + 1][0]) / 2), my = r2((tp[i][1] + tp[i + 1][1]) / 2); d += ` Q${tp[i][0]} ${tp[i][1]} ${mx} ${my}`; }
  d += ` L${tp[tp.length - 1][0]} ${tp[tp.length - 1][1]}`;
  const pc = (x) => r2(Math.min(100, Math.max(0, x / 19.2)));
  const clip = dir > 0 ? [`inset(0% ${r2(100 - pc(tp[0][0]))}% 0% 0%)`, `inset(0% ${r2(100 - pc(tp[n][0]))}% 0% 0%)`] : [`inset(0% 0% 0% ${pc(tp[0][0])}%)`, `inset(0% 0% 0% ${pc(tp[n][0])}%)`];
  return { pts, path: d, clip };
}
const FLIGHTS = {
  ch2: makeFlight(14, (u) => -380 + 2420 * u, (u) => 330 - 150 * u + 60 * Math.sin(u * Math.PI * 2.2), [8, 122], 1),
  ch3: makeFlight(12, (u) => -440 + 1980 * u, (u) => 690 + 10 * Math.sin(u * Math.PI * 4), [30, 214], 1),
  ch4: makeFlight(14, (u) => 2000 - 2420 * u, (u) => 230 + 140 * u - 55 * Math.sin(u * Math.PI * 2), [322, 122], -1),
};
const flightCfg = (k) => ({ pts: FLIGHTS[k].pts, clip: FLIGHTS[k].clip });
function chapter(id, icon, title, eyebrow, doodle) {
  return `<div id="${id}" class="chapter">
  <div class="dotgrid" data-layout-ignore></div><div class="chglow" data-layout-ignore></div>
  <div id="${id}-doodle" class="doodle" data-layout-ignore>${doodle}</div>
  <div id="${id}-trail" class="trail" data-layout-ignore><svg viewBox="0 0 1920 1080" width="1920" height="1080"><path d="${FLIGHTS[id].path}" fill="none" stroke="#202722" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 22"/></svg></div>
  <div class="chrow">
    <div id="${id}-icon" class="chicon">${glyph(icon, "glyph chg")}</div>
    <div class="chtext"><p id="${id}-eye" class="cheye">${eyebrow}</p><h2 id="${id}-title" class="chtitle">${title}</h2></div>
  </div></div>`;
}
// S-curve wire with its sampled length (for stroke-dash drawing)
function wire(id, x1, y1, x2, y2) {
  const c1 = [x1 + 95, y1], c2 = [x2 - 95, y2];
  let L = 0, px = x1, py = y1;
  for (let i = 1; i <= 48; i++) { const t = i / 48, u = 1 - t; const x = u * u * u * x1 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x2, y = u * u * u * y1 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y2; L += Math.hypot(x - px, y - py); px = x; py = y; }
  const d = `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`, len = Math.ceil(L) + 2;
  return `<path id="${id}" class="hw" d="${d}" data-len="${len}" style="stroke-dasharray:${len}"/><path class="hw-flow" d="${d}"/>`;
}

// ---------- data ----------
// Compare numbers: app formula (calc.ts / value-score.ts), 24K AED 482.65/g, 22K = 0.92, 10 g, fee 1%, VAT 5%, store pickup.
const STORES = [
  { k: "A", em: "Dubai", name: "Classic gold band", mk: 380, img: "band-0006" },
  { k: "B", em: "Sharjah", name: "Polished gold band", mk: 520, img: "band-0020" },
  { k: "C", em: "Dubai", name: "Comfort-fit gold band", mk: 290, img: "band-0034" },
  { k: "D", em: "Abu Dhabi", name: "Wedding gold band", mk: 450, img: "band-0050" },
].map((s) => {
  const gold = r2(482.65 * 0.92 * 10), merch = r2(gold + s.mk), fee = r2(merch * 0.01), vat = r2((merch + fee) * 0.05), total = r2(merch + fee + vat);
  const score = Math.round(100 - r2((s.mk + fee) / gold * 100));
  return { ...s, gold, fee, vat, total, score };
});
const aed = (v) => "AED " + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const byTotal = [...STORES].sort((a, b) => a.total - b.total).map((s) => s.k); // C, A, D, B
const TYPED = "22K bangle with a Khaleeji pattern, about 20 g";
const SPARK = (() => { // real recorded closes: 519.85 (9 Sep) → 482.65 (22 Oct), interpolated with gentle variation
  const R = mulberry32(5), pts = []; const n = 24;
  for (let i = 0; i < n; i++) { const t = i / (n - 1); const v = 519.85 + (482.65 - 519.85) * t + (i && i < n - 1 ? (R() - 0.5) * 7 : 0); pts.push([r2(4 + t * 292), r2(6 + (523.5 - v) / (523.5 - 479.25) * 52)]); }
  return pts.map((p) => p.join(",")).join(" ");
})();
const HALF = 0.2612; // half-beat at 114.84 BPM (vol-11 and vol-9 share this lattice)

// ================= scene library =================
// Each scene: html(V), orig (its own time base), sfx (in orig time), params(V, slot).
const SCENES = {};

SCENES.hook = {
  id: "s1", orig: 0,
  html: (V) => `<div id="s1in" class="inner cosmos">
  <div class="nebula" data-layout-ignore></div>
  ${stars("stars1", 130, 7)}
  ${orbit("orb1")}
  <div id="flash1" class="flash" data-layout-ignore></div>
  <p class="hand meet"><span id="meet">Meet</span></p>
  <div class="lockup1">
   <div id="rg1" class="rgwrap" data-layout-ignore><div class="ringglow"></div></div>
   <div id="ring1" class="ringsprite" data-layout-ignore></div>
   <div id="wm1" class="wordmark wm-big" data-hf-motion-blur='{"samplesPerFrame": 10}'>GET GOLD</div>
   <div id="stripe1" class="stripe dark"><i></i><i></i><i></i></div>
   <p id="tag1" class="tagline">${words(V.tagline)}</p>
   <div id="burst1" class="burst" data-layout-allow-occlusion>${starburst()}<span>UAE</span></div>
  </div></div>`,
  sfx: [[1.56, "impact/impactSoft_medium_001.ogg", 0.7], [1.6, "impact/impactBell_heavy_000.ogg", 0.5], [1.84, "interface/drop_002.ogg", 0.6]],
  params: () => ({}),
};

SCENES.compare = {
  id: "s2", orig: 3.7,
  html: () => `<div id="s2in" class="inner">
  <div id="ui2" class="uiscene">
   ${studioBg("stars2", 21)}
   <div id="ghost2" class="ghostpanel" data-layout-ignore><p class="gp-l">Live 24K reference</p><p class="gp-v">AED 482.65/g</p><p class="gp-s">Rechecked every 10s</p></div>
   <div class="persp"><div id="win2" class="window">
    ${chrome("getgold.ae/compare")}
    ${siteHeader("GetGold Compare")}
    <div class="hero2"><div><p class="h2eye">Smart cross-store comparison</p><h1 class="h2t">GetGold Compare</h1></div>
     <div class="rank"><span class="rank-l">Rank by</span><span id="pillTotal" class="pill">Lowest final total</span><span class="pill">Lowest making charge</span></div></div>
    <p class="matches">Matches across different stores · 4 stores · Gold reference AED 482.65/g · 22K AED 444.04/g</p>
    <div class="cards">${STORES.map((s, i) => `<article id="card${s.k}" class="ccard" style="left:${44 + i * 374}px">
  <div class="cimg"><img src="assets/img/${s.img}.webp" alt=""><span id="badge${s.k}" class="cbadge">Lowest final total</span></div>
  <div class="cbody"><p class="ceye">Store ${s.k} · ${s.em}</p><h3 class="cname">${s.name}</h3><p class="cmeta">22K · 10g · AED 444.04/g</p>
    <div class="cfinal"><p class="cfl">Estimated final total</p><p class="cfv">${aed(s.total)}</p><p class="cfs">Get Gold Value Score: ${s.score}/100</p></div>
    <dl class="crows"><div><dt>Gold value</dt><dd>${aed(s.gold)}</dd></div><div><dt>Making after discount</dt><dd>${aed(s.mk)}</dd></div><div><dt>Get Gold fee</dt><dd>${aed(s.fee)}</dd></div><div><dt>VAT (5%)</dt><dd>${aed(s.vat)}</dd></div></dl>
  </div></article>`).join("")}</div>
    ${cursor("cur2")}
   </div></div>
   <div id="lens" class="lens" data-layout-allow-overlap data-layout-allow-occlusion><div id="lensIn" class="lens-in">
      <p class="lz-h" data-layout-allow-overlap data-layout-allow-occlusion>Store C · Dubai</p>
      ${[["Gold value", STORES[2].gold], ["Making after discount", STORES[2].mk], ["Get Gold fee", STORES[2].fee], ["VAT (5%)", STORES[2].vat]].map(([l, v]) => `<div class="lz-r"><span data-layout-allow-overlap data-layout-allow-occlusion>${l}</span><b data-layout-allow-overlap data-layout-allow-occlusion>${aed(v)}</b></div>`).join("")}
      <div class="lz-r lz-t"><span data-layout-allow-overlap data-layout-allow-occlusion>Estimated final total</span><b data-layout-allow-overlap data-layout-allow-occlusion>${aed(STORES[2].total)}</b></div>
    </div><span class="lens-shine"></span></div>
   ${sticker("stk2", "stk-a", "Every charge explained", ` data-hf-motion-blur='{"samplesPerFrame": 8}'`)}
  </div>
  ${chapter("ch2", "scales", "GetGold Compare", "Smart cross-store comparison", FALCON)}
 </div>`,
  sfx: [[4.7, "casino/card-shove-2.ogg", 0.42], [5.28, "interface/drop_001.ogg", 0.5], [5.54, "interface/drop_002.ogg", 0.5], [5.8, "interface/drop_003.ogg", 0.5], [6.07, "interface/drop_001.ogg", 0.5],
    [6.86, "ui/mouseclick1.ogg", 0.85], [6.92, "casino/card-slide-5.ogg", 0.42], [7.38, "ui/rollover2.ogg", 0.65], [7.9, "impact/impactSoft_medium_002.ogg", 0.7]],
  params: () => ({ flight: flightCfg("ch2"), order: STORES.map((s) => s.k), byTotal }),
};

SCENES.size = {
  id: "s3", orig: 8.96,
  html: () => `<div id="s3in" class="inner">
  <div id="ui3" class="uiscene">
   ${studioBg("stars3", 33)}
   <div id="ghost3" class="ghostpanel gp-r" data-layout-ignore><p class="gp-l">Ring size chart</p><p class="gp-v">EU 54 · US 7</p><p class="gp-s">Diameter 17.3 mm</p></div>
   <div class="persp"><div id="win3" class="window">
    ${chrome("getgold.ae/size-guide")}
    ${siteHeader("Shop")}
    <div class="sz">
     <h1 class="sz-t">Find your ring, bangle or diamond size</h1>
     <div class="sz-tabs"><span class="on">Rings</span><span>Bangles</span><span>Diamonds</span></div>
     <div class="sz-steps"><span class="done"><i>✓</i>1 Set up your screen</span><span class="cur"><i>2</i>Match your ring</span></div>
     <div class="sz-stage"><span class="sz-chip">Size on screen</span>
      <img id="band3" class="sz-band" src="assets/img/band-top.webp" alt="">
      <div id="szCircle" class="sz-circle"></div>
      <div class="sz-slider"><i></i><b id="szKnob"></b></div>
     </div>
     <div class="sz-res">
      <p class="sz-l">Your ring size</p>
      <div class="odo"><div id="odoCol" class="odo-col">${["51", "52", "53", "54"].map((n) => `<span>${n}</span>`).join("")}</div></div>
      <p class="sz-intl">International size (EU / ISO)</p>
      <div class="sz-conv"><span id="cv1">US 7</span><span id="cv2">Indian 14</span><span id="cv3">Diameter 17.3 mm</span></div>
      <div id="saveBtn" class="sz-save"><span id="saveTick" class="tick">✓</span><span>Save as my size (EU 54)</span></div>
     </div>
    </div>
    ${sticker("stk3", "stk-b", "Match a ring on screen")}
    ${cursor("cur3")}
   </div></div>
  </div>
  ${chapter("ch3", "ruler", "Size guide", "Rings · Bangles · Diamonds", DHOW)}
 </div>`,
  sfx: [[9.7, "casino/card-shove-2.ogg", 0.42], [10.3, "impact/impactSoft_medium_003.ogg", 0.65], [10.54, "interface/click_003.ogg", 0.55], [10.71, "interface/click_003.ogg", 0.55], [10.88, "interface/click_003.ogg", 0.55], [11.6, "ui/mouseclick1.ogg", 0.85], [11.66, "interface/bong_001.ogg", 0.55]],
  params: () => ({ flight: flightCfg("ch3") }),
};

const chips = (arr, sel, idp) => arr.map((c) => `<span${c === sel ? ` id="${idp}"` : ""} class="chip">${c}</span>`).join("");
const OFFERS = [
  { k: "A", em: "Dubai", w: "20.4 g", mk: 720, cert: 45 },
  { k: "C", em: "Dubai", w: "19.8 g", mk: 640, cert: 60 },
  { k: "D", em: "Abu Dhabi", w: "20.1 g", mk: 810, cert: 50 },
];
const KEYS = ["001", "003", "005", "007", "009", "011", "013", "015", "017", "019", "021", "023"];
const keyTicks = (t0, dt, vol = 0.42) => { const out = []; for (let i = 0, k = 0; i < TYPED.length; i += 3, k++) out.push([r2(t0 + i * dt), `keyboard/keypress-${KEYS[k % KEYS.length]}.wav`, vol]); return out; };
SCENES.request = {
  id: "s4", orig: 12.65,
  html: () => `<div id="s4in" class="inner">
  <div id="ui4" class="uiscene">
   ${studioBg("stars4", 47)}
   <div class="persp"><div id="win4" class="window win-req">
    ${chrome("getgold.ae/requests/new")}
    ${siteHeader("Shop", true)}
    <div class="rq">
     <p class="rq-eye">Get Gold Request</p>
     <h1 class="rq-t">Can’t find it? Let stores find it for you.</h1>
     <p class="rq-lab">What are you looking for?</p>
     <div class="chips">${chips(["ring", "necklace", "bracelet", "cuff", "earring", "bangle", "set", "chain", "pendant", "bar", "coin"], "bangle", "chipType")}</div>
     <div class="rq-row">
      <div><p class="rq-lab">Gold purity</p><div class="chips">${chips(["24 K", "22 K", "21 K", "18 K"], "22 K", "chipK")}</div></div>
      <div><p class="rq-lab">Preferred emirate</p><div class="chips">${chips(["Abu Dhabi", "Dubai", "Sharjah", "Ajman"], "Dubai", "chipEm")}</div></div>
     </div>
     <div class="rq-row rq-budget"><div><p class="rq-lab">Minimum budget (AED)</p><p class="field">9,500</p></div><div><p class="rq-lab">Maximum budget (AED)</p><p class="field">11,000</p></div></div>
     <p class="rq-lab">Describe the piece</p>
     <p class="field area">${[...TYPED].map((c, i) => `<span class="tc" id="tc${i}">${c === " " ? "&nbsp;" : c}</span>`).join("")}<span id="caret" class="caret"></span></p>
     <div class="rq-foot"><span id="sendBtn" class="send">Send request to verified stores</span><span class="rq-note">Submitting is free and does not place an order.</span></div>
    </div>
    ${cursor("cur4")}
   </div></div>
   <div class="offers">${OFFERS.map((o, i) => `<div id="offer${i}" class="offer"><div class="of-top"><span class="of-pill">Offer</span><span class="of-st">Store ${o.k} · ${o.em}</span><span class="of-v">${glyph("shield", "glyph of-g")}Verified store</span></div><p class="of-t">22K bangle · ${o.w}</p><div class="of-rows"><span>Making charge <b>${aed(o.mk)}</b></span><span>Certificate / assay <b>${aed(o.cert)}</b></span></div></div>`).join("")}</div>
   ${sticker("stk4", "stk-c", "Send one request")}
  </div>
  ${chapter("ch4", "plane", "Get Gold Request", "Can’t find the piece?", FALCON)}
 </div>`,
  sfx: [[13.36, "casino/card-shove-2.ogg", 0.4], [13.7, "ui/mouseclick1.ogg", 0.7], [14.22, "ui/mouseclick1.ogg", 0.7], [14.76, "ui/mouseclick1.ogg", 0.7], ...keyTicks(14.84, 0.0165),
    [15.81, "ui/mouseclick1.ogg", 0.85], [16.0, "impact/impactSoft_medium_004.ogg", 0.65], [16.34, "casino/card-slide-5.ogg", 0.48], [16.86, "casino/card-slide-5.ogg", 0.48], [17.39, "casino/card-slide-5.ogg", 0.48]],
  params: () => ({ flight: flightCfg("ch4"), typed: { n: TYPED.length, t0: 14.84, dt: 0.0165 } }),
};

SCENES.grid = {
  id: "s5", orig: 17.91,
  html: (V) => `<div id="s5in" class="inner bonebg">
  <div class="dotgrid" data-layout-ignore></div>
  <div class="arcs" data-layout-ignore><i></i><i></i><i></i></div>
  <div class="s5head"><h2 class="s5l"><span id="gh1">${V.grid.l1}</span></h2><h2 class="s5l"><span id="gh2" class="mk"><span id="marker" class="marker"></span><span class="mk-t">${V.grid.l2}</span></span></h2></div>
  <div class="gridpersp"><div id="grid" class="grid">${V.grid.tiles.map((t, i) => `<div class="tile tile${i}"><span class="ti ${i % 2 ? "ti-g" : "ti-j"}">${glyph(t.k)}</span><p class="tt">${t.t}</p>${i === 0 ? `<p class="tp">AED 482.65/g</p><svg class="spark" viewBox="0 0 300 64"><polyline id="spark" points="${SPARK}" fill="none" stroke="#B97820" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}<p class="ts">${t.s}</p></div>`).join("")}</div></div>
 </div>`,
  sfx: [[17.91, "casino/card-fan-1.ogg", 0.55], [18.96, "impact/impactGlass_light_002.ogg", 0.45]],
  params: () => ({}),
};

SCENES.end = {
  id: "s6", orig: 21.59,
  html: (V) => `<div id="s6in" class="inner cosmos">
  <div class="nebula" data-layout-ignore></div>
  ${stars("stars6", 130, 91)}
  ${orbit("orb6")}
  <div class="lockup6">
   <div id="rg6" class="rgwrap" data-layout-ignore><div class="ringglow g6"></div></div>
   <div id="ring6" class="ringsprite r6" data-layout-ignore></div>
   <div id="wm6" class="wordmark wm-end" data-hf-motion-blur='{"samplesPerFrame": 10}'>GET GOLD</div>
   <div id="stripe6" class="stripe dark s6"><i></i><i></i><i></i></div>
   ${V.end.badge ? sticker("badge6", "badge6", V.end.badge).replace(" data-layout-allow-overlap", "") : ""}
   ${V.end.title ? `<p id="endTitle" class="end-title">${V.end.title}</p>` : ""}
   ${V.end.ctas && V.end.ctaTop ? `<div class="cta6">${V.end.ctas.map((c) => `<span class="ctai ${c.c}"><small>${c.k}</small>${c.v}</span>`).join("")}</div>` : ""}
   <p id="ar6" class="ar-line${V.end.lower ? " lower" : ""}" lang="ar" dir="rtl"><span>${V.end.ar}</span></p>
   ${V.end.en ? `<p id="en6" class="en-line${V.end.lower ? " lower" : ""}">${V.end.en}</p>` : ""}
   ${V.end.ctas && !V.end.ctaTop ? `<div class="cta6 low">${V.end.ctas.map((c) => `<span class="ctai ${c.c}"><small>${c.k}</small>${c.v}</span>`).join("")}</div>` : ""}
  </div>
 </div>
 <div id="irisRing" class="iris-ring" data-layout-ignore></div>`,
  sfx: [[22.6, "impact/impactSoft_medium_001.ogg", 0.6], [22.65, "impact/impactBell_heavy_003.ogg", 0.6], [22.93, "interface/drop_002.ogg", 0.55]],
  params: () => ({}),
};

// ---------- new: what Get Gold is ----------
SCENES.hub = {
  id: "s7", orig: 0,
  html: (V) => {
    const H = V.hub; let left = "", right = "", wires = "";
    if (H.mode === "market") {
      [["A", "Dubai"], ["B", "Sharjah"], ["D", "Abu Dhabi"]].forEach(([k, em], i) => {
        const top = 410 + i * 138;
        left += `<div id="hl${i}" class="hl-item" style="top:${top}px"><span class="hi-ico">${glyph("store")}</span><div><p class="hi-name">Store ${k} · ${em}</p><p class="hi-sub">${glyph("shield")}Verified</p></div></div>`;
        wires += wire(`hwl${i}`, 550, top + 59, 740, 560 + i * 60);
      });
      left += `<p id="hlNote" class="hl-note">Trade licence and identity checked, reviewed by hand.</p>`;
      H.right.forEach(([g, label], j) => {
        const top = 410 + j * 120;
        right += `<div id="hr${j}" class="hr-item" style="top:${top}px"><span class="hi-ico g">${glyph(g)}</span><p class="hi-name">${label}</p></div>`;
        wires += wire(`hwr${j}`, 1180, 530 + j * 60, 1370, top + 48);
      });
    } else {
      left = `<div id="hl0" class="yours"><div class="yo-top"><span class="yo-ico">${glyph("store")}</span><p class="yo-t">Your store</p></div>${["Verified store", "Your own making charge", "Your photos and pieces", "Paid directly"].map((r) => `<p class="yo-row"><i>✓</i>${r}</p>`).join("")}</div>`;
      wires += wire("hwl0", 550, 620, 740, 620);
      ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"].forEach((em, j) => {
        const top = 392 + j * 82;
        right += `<div id="hr${j}" class="hr-item em" style="top:${top}px"><span class="hi-ico g">${glyph("user")}</span><p class="hi-name">${em}</p></div>`;
        wires += wire(`hwr${j}`, 1180, 470 + j * 50, 1370, top + 34);
      });
    }
    return `<div id="s7in" class="inner">
  <div class="uiscene">${studioBg("stars7", 71)}
   <svg class="hub-wires" viewBox="0 0 1920 1080" width="1920" height="1080" data-layout-ignore>${wires}</svg>
   ${headblk(H.eye, H.t, H.s)}
   <p class="colh" style="left:110px">${H.lh}</p><p class="colh" style="left:1370px">${H.rh}</p>
   ${left}${right}
   <div id="hubCore" class="hub-core"><span class="hc-gg">GG</span><p class="hc-wm">GET GOLD</p><p class="hc-ref">24K gold · market reference</p><p class="hc-price">AED 482.65/g</p>
    <p class="hc-live"><span class="hc-dot"><span id="hubPing" class="hc-ping"></span></span>Rechecked every 10s</p>
    <svg class="hc-spark" viewBox="0 0 300 64"><polyline id="hubSpark" points="${SPARK}" fill="none" stroke="#B97820" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
   ${sticker("stk7", "stk-hub", H.sticker)}
  </div></div>`;
  },
  sfx: (P) => [[0.5, "impact/impactSoft_medium_003.ogg", 0.55], [P.left[0], "interface/drop_001.ogg", 0.5], [P.left[P.left.length - 1], "interface/drop_003.ogg", 0.5], [P.right[0], "interface/drop_002.ogg", 0.5], [P.right[P.right.length - 1], "interface/drop_002.ogg", 0.5], [P.sticker, "impact/impactSoft_medium_002.ogg", 0.65]],
  params: (V) => V.hub.mode === "market"
    ? { left: [0.78, 1.04, 1.31], right: [1.83, 2.09, 2.35, 2.61], flowOn: 2.9, sticker: 3.13 }
    : { left: [0.78], right: [1.31, 1.57, 1.83, 2.09, 2.35, 2.61, 2.87], flowOn: 3.0, sticker: 3.4 },
};

// ---------- new: how it works ----------
SCENES.lanes = {
  id: "s8", orig: 0,
  html: (V) => {
    const L = V.lanes; let body = "";
    L.tracks.forEach((tr, i) => { body += `<div class="ln-track" style="left:${tr.x0}px;top:${tr.y - 3}px;width:${tr.x1 - tr.x0}px"><i id="lnF${i}" class="ln-fill"></i></div>`; });
    (L.laneTags || []).forEach((t) => { body += `<p class="ln-lane ${t.c}" style="left:110px;top:${t.y - 27}px">${glyph(t.g)}${t.label}</p>`; });
    (L.verts || []).forEach((v) => { body += `<i id="lnV${v.id}" class="ln-vert" style="left:${v.x - 2}px;top:${v.y0}px;height:${v.y1 - v.y0}px"></i>`; });
    L.nodes.forEach((n, i) => {
      const ns = L.ns || 112, h = ns / 2, sz = L.size ? ` ${L.size}` : "";
      body += `<div id="lnN${i}" class="ln-node${n.lane ? " jn" : ""}" style="left:${n.x - h}px;top:${n.y - h}px;width:${ns}px;height:${ns}px">${glyph(n.g)}</div>`;
      if (n.num) body += `<p id="lnU${i}" class="ln-num${sz}" style="left:${n.x - h}px;width:${ns}px;top:${n.y - h - 46}px">${n.num}</p>`;
      const w = L.labW || 300, lab = `<p class="ln-l">${n.l}</p>${n.c ? `<p class="ln-c">${n.c}</p>` : ""}`;
      body += n.above
        ? `<div id="lnL${i}" class="ln-lab${sz}" style="left:${n.x - w / 2}px;width:${w}px;top:${n.y - h - 120}px;height:104px;display:flex;flex-direction:column;justify-content:flex-end">${lab}</div>`
        : `<div id="lnL${i}" class="ln-lab${sz}" style="left:${n.x - w / 2}px;width:${w}px;top:${n.y + h + 18}px">${lab}</div>`;
    });
    return `<div id="s8in" class="inner bonebg"><div class="dotgrid" data-layout-ignore></div><div class="fd-glow" style="left:900px;top:200px" data-layout-ignore></div>
   ${headblk(L.eye, L.t, null, true)}
   ${body}<i id="lnToken" class="ln-token" data-layout-ignore></i></div>`;
  },
  sfx: (P) => P.nodes.map((n, i) => i === P.nodes.length - 1 ? [n.t, "interface/bong_001.ogg", 0.55] : [n.t, "interface/click_003.ogg", 0.45]),
  params: (V) => {
    const L = V.lanes;
    return { nodes: L.nodes.map((n) => ({ x: n.x, y: n.y, t: n.t, lane: n.lane || 0, above: !!n.above, fill: n.fill || 0, vert: n.vert || null })) };
  },
};

// ---------- new: buyer request meets jeweller offer ----------
SCENES.split = {
  id: "s9", orig: 0,
  html: () => `<div id="s9in" class="inner">
  <div class="uiscene">${studioBg("stars9", 83)}
   <p class="sp-tag b">${glyph("user")}Buyer</p><p class="sp-tag j">${glyph("store")}Jeweller</p>
   <div class="persp">
    <div id="spB" class="spwin b">${chrome("getgold.ae/requests/new")}
     <div class="sp-body">
      <p class="sp-eye">Get Gold Request</p>
      <h3 class="sp-t">Can’t find it? Let stores find it for you.</h3>
      <div class="sp-chips"><span>bangle</span><span>22 K</span><span>Dubai</span><span class="o">AED 9,500 – 11,000</span></div>
      <p class="sp-lab">Describe the piece</p>
      <p class="sp-field">${[...TYPED].map((c, i) => `<span class="tc" id="tq${i}">${c === " " ? "&nbsp;" : c}</span>`).join("")}<span class="caret"></span></p>
      <span id="spSend" class="sp-btn">Send request to verified stores</span>
      <div id="spOffer" class="sp-offer" data-layout-allow-overlap><div class="of-top"><span class="of-pill">Offer</span><span class="of-st">Store C · Dubai</span><span class="of-v">${glyph("shield", "glyph of-g")}Verified store</span></div>
       <div class="of-rows"><span>Making charge <b>${aed(640)}</b></span><span>Certificate fee <b>${aed(60)}</b></span></div>
       <span id="spAccept" class="sp-btn g">Accept this offer</span></div>
     </div>${cursor("cur9a")}</div>
    <div id="spJ" class="spwin j">${chrome("getgold.ae/vendor/requests")}
     <div class="sp-body">
      <p class="sp-eye">Your Get Gold workspace</p>
      <h3 class="sp-t">Buyer requests<span class="sp-pill">New opportunities</span></h3>
      <p id="spEmpty" class="sp-empty">No open requests right now</p>
      <div id="spReq" class="sp-req"><p class="sp-req-t">${TYPED}</p><p class="sp-req-m">22 K · Dubai · AED 9,500 – 11,000 · No fixed deadline</p></div>
      <div id="spForm" class="sp-form"><p class="sp-form-t">Create an offer for this buyer</p>
       <div class="sp-grid"><div><p class="sp-f">Making charge</p><p id="spV0" class="sp-v"><b>AED 640</b></p></div><div><p class="sp-f">Certificate fee</p><p id="spV1" class="sp-v"><b>AED 60</b></p></div><div><p class="sp-f">Ready in days</p><p id="spV2" class="sp-v"><b>3</b></p></div></div>
       <span id="spOfferBtn" class="sp-btn g">Send offer</span><span id="spSent" class="sp-sent">✓ Offer sent</span></div>
     </div>${cursor("cur9b")}</div>
   </div>
   <div id="flyReq" class="flycard" data-layout-ignore>${TYPED}<small>22 K · Dubai · AED 9,500 – 11,000</small></div>
   <div id="flyOffer" class="flycard" data-layout-ignore>Offer · Store C · Dubai<small>Making charge AED 640 · Certificate fee AED 60</small></div>
   ${sticker("stk9", "stk-sp", "Verified stores reply with offers")}
  </div></div>`,
  sfx: (P) => [...keyTicks(P.typed.t0, P.typed.dt, 0.38), [P.send, "ui/mouseclick1.ogg", 0.85], [P.send + 0.1, "casino/card-shove-2.ogg", 0.4], [P.land, "interface/drop_002.ogg", 0.55],
    ...P.fields.map((t) => [t, "interface/click_003.ogg", 0.45]), [P.offer, "ui/mouseclick1.ogg", 0.85], [P.offer + 0.04, "interface/bong_001.ogg", 0.5], [P.offer + 0.14, "casino/card-slide-5.ogg", 0.45], [P.back, "interface/drop_001.ogg", 0.5], [P.sticker, "impact/impactSoft_medium_004.ogg", 0.6]],
  params: () => ({ typed: { n: TYPED.length, t0: 0.26, dt: 0.0165 }, send: 1.31, land: 2.09, form: 2.3, fields: [2.61, 2.87, 3.13], offer: 3.39, back: 4.18, sticker: 4.44,
    fly: { a: [290, 520], b: [1230, 380], c: [1240, 760], d: [300, 780] } }),
};

// ---------- new: add your pieces (AI quick capture + spreadsheet) ----------
const TRAY_BOXES = [[149, 156, 458, 464], [659, 162, 853, 368], [186, 621, 386, 820], [490, 703, 630, 898], [500, 401, 647, 580], [703, 618, 912, 755]]; // tray render detections (1080 px)
const DRAFTS = ["Bangle", "Ring", "Gold coin", "Gold bar", "Pendant", "Earrings"];
const TS = 580 / 1080, FX = 110 + 20, FY = 316 + 20; // tray drawn at 580 px inside the frame
const DRAFT_POS = DRAFTS.map((_, i) => [790 + (i % 3) * 346, 316 + Math.floor(i / 3) * 220]);
SCENES.pieces = {
  id: "s10", orig: 0,
  html: (V) => {
    const boxes = TRAY_BOXES.map(([x1, y1, x2, y2], i) => `<div id="pcB${i}" class="pc-box" style="left:${r2(20 + x1 * TS - 6)}px;top:${r2(20 + y1 * TS - 6)}px;width:${r2((x2 - x1) * TS + 12)}px;height:${r2((y2 - y1) * TS + 12)}px"><span class="pc-tag">${DRAFTS[i]}</span></div>`).join("");
    const drafts = TRAY_BOXES.map(([x1, y1, x2, y2], i) => {
      const s = 124 / (Math.max(x2 - x1, y2 - y1) * 1.18), cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      return `<div id="pcD${i}" class="pc-draft" style="left:${DRAFT_POS[i][0]}px;top:${DRAFT_POS[i][1]}px"><span class="pc-thumb" style="background-size:${r2(1080 * s)}px;background-position:${r2(62 - cx * s)}px ${r2(62 - cy * s)}px"></span><div><span class="pc-d-pill">Draft</span><p class="pc-d-t">${DRAFTS[i]}</p><p class="pc-d-s">Add weight &amp; making</p></div></div>`;
    }).join("");
    const rows = [["22K floral gold bangle", "22K", "18.40 g", "AED 450"], ["21K rope chain", "21K", "12.10 g", "AED 260"], ["18K diamond ring", "18K", "4.20 g", "AED 380"]];
    return `<div id="s10in" class="inner">
  <div class="uiscene">${studioBg("stars10", 97)}
   ${headblk(V.pieces.eye, "Add your pieces", "Add one by one, upload a spreadsheet, or send us photos on WhatsApp.")}
   <div id="pcFrame" class="pc-frame" data-layout-allow-overlap><img class="pc-tray" src="assets/img/tray.webp" alt=""><i id="pcScan" class="pc-scan"></i>${boxes}
    <span id="pcChip" class="pc-chip">${glyph("sparkle")}Quick capture with AI</span></div>
   ${drafts}
   <div id="pcSheet" class="pc-sheet"><p class="pc-sh-h">${glyph("sheet")}Excel/CSV upload · 1–200 products per file</p>
    <div class="pc-row hd"><span>Name</span><span>Karat</span><span>Weight</span><span>Making</span><span></span></div>
    ${rows.map((r, i) => `<div id="pcR${i}" class="pc-row"><span>${r[0]}</span><span>${r[1]}</span><span>${r[2]}</span><span>${r[3]}</span><span class="pc-ok">✓</span></div>`).join("")}</div>
   ${sticker("stk10", "stk-pc", "Nothing is published until you review it.")}
  </div></div>`;
  },
  sfx: (P) => [[P.scan, "ui/rollover2.ogg", 0.55], [P.boxes[0], "interface/click_003.ogg", 0.5], [P.boxes[P.boxes.length - 1], "interface/click_003.ogg", 0.5], [P.drafts, "casino/card-fan-1.ogg", 0.5], [P.sheet, "casino/card-slide-5.ogg", 0.42], ...P.rows.map((t) => [t + 0.2, "interface/click_003.ogg", 0.4]), [P.sticker, "impact/impactSoft_medium_003.ogg", 0.65]],
  params: () => ({
    scan: 0.55, boxes: TRAY_BOXES.map((_, i) => r2(0.78 + i * HALF)), drafts: 2.35, sheet: 3.13, rows: [3.39, 3.66, 3.92], sticker: 4.44,
    fly: TRAY_BOXES.map(([x1, y1, x2, y2], i) => ({ dx: r2(FX + ((x1 + x2) / 2) * TS - (DRAFT_POS[i][0] + 158)), dy: r2(FY + ((y1 + y2) / 2) * TS - (DRAFT_POS[i][1] + 98)), s: 0.35 })),
  }),
};

// ---------- new: founding stores ----------
SCENES.founding = {
  id: "s11", orig: 0,
  html: () => `<div id="s11in" class="inner bonebg"><div class="dotgrid" data-layout-ignore></div><div class="fd-glow" data-layout-ignore></div>
   <div id="fdSeal" class="fd-seal" data-layout-ignore>${starburst(24, 100, 88)}<div class="fd-in"><p class="fd-k">Founding store</p><p class="fd-v">Free for life</p></div></div>
   <div class="fd-copy">${headblk("For UAE gold & jewellery stores", "Become a founding store.", null, true).replace('class="headblk ink"', 'class="headblk ink" style="position:relative;left:0;top:0;width:1080px"')}
    ${[["No listing fee", "List your pieces without paying to be on Get Gold."], ["No commission", "No commission on your sales — including none on your making charge."], ["Free for life", "No subscription. Founding stores keep this for life."]].map(([t, s], i) => `<div id="fdR${i}" class="fd-row"><span class="fd-ck">✓</span><div><p class="fd-rt">${t}</p><p class="fd-rs">${s}</p></div></div>`).join("")}
    <p id="fdKeep" class="fd-keep">You keep what you sell.</p></div>
   ${sticker("stk11", "stk-fd", "Founding places are limited.")}
  </div>`,
  sfx: (P) => [[P.seal - 0.04, "impact/impactSoft_medium_001.ogg", 0.7], [P.seal, "impact/impactBell_heavy_000.ogg", 0.42], ...P.rows.map((t) => [t, "impact/impactGlass_light_002.ogg", 0.4]), [P.sticker, "impact/impactSoft_medium_002.ogg", 0.65]],
  params: () => ({ seal: 0.52, rows: [1.04, 1.57, 2.09], keep: 2.61, sticker: 3.13 }),
};

// ================= the three cuts =================
const LANES_BOTH = (() => {
  const X = [560, 860, 1160, 1460, 1760], Y0 = 470, Y1 = 800, f = (x) => r2((x - X[0]) / (X[4] - X[0]));
  const b = (i, g, l, c, t, extra = {}) => ({ x: X[i], y: Y0, g, l, c, t, lane: 0, above: true, ...extra });
  const j = (i, g, l, c, t, extra = {}) => ({ x: X[i], y: Y1, g, l, c, t, lane: 1, ...extra });
  const T = [2, 4, 5, 6, 8, 10, 11, 12, 14].map((k) => r2(k * HALF));
  return {
    eye: "How it works", t: "From browsing to gold in your hands.", labW: 280,
    tracks: [{ x0: X[0], x1: X[4], y: Y0 }, { x0: X[0], x1: X[4], y: Y1 }],
    laneTags: [{ c: "b", g: "user", label: "Buyers", y: Y0 }, { c: "j", g: "store", label: "Jewellers", y: Y1 }],
    verts: [{ id: "c0", x: X[0], y0: Y0 + 58, y1: Y1 - 58 }, { id: "c2", x: X[2], y0: Y0 + 58, y1: Y1 - 58 }, { id: "c3", x: X[3], y0: Y0 + 58, y1: Y1 - 58 }, { id: "c4", x: X[4], y0: Y0 + 58, y1: Y1 - 58 }],
    nodes: [
      j(0, "upload", "List your pieces", null, T[0]),
      b(0, "eye", "Discover", null, T[1], { vert: "c0" }),
      b(1, "scales", "Compare", null, T[2], { fill: f(X[1]) }),
      b(2, "plane", "Request", "No payment yet", T[3], { fill: f(X[2]) }),
      j(2, "shield", "Confirm the final price", null, T[4], { vert: "c2", fill: f(X[2]) }),
      b(3, "coin", "Pay the store", null, T[5], { fill: f(X[3]) }),
      j(3, "coin", "Paid directly", null, T[6], { vert: "c3", fill: f(X[3]) }),
      j(4, "truck", "Prepare & fulfil", null, T[7], { fill: 1 }),
      b(4, "pendant", "Receive", "Delivery or collection", T[8], { vert: "c4", fill: 1 }),
    ],
  };
})();
const LANES_CUSTOMERS = (() => {
  const X = [215, 513, 811, 1109, 1407, 1705], Y = 600, f = (x) => r2((x - X[0]) / (X[5] - X[0]));
  const S = [["eye", "Discover", "Find the piece you want"], ["scales", "Compare", "See the charges clearly"], ["plane", "Request", "You do not pay at this stage"], ["shield", "Store confirms", "The final current price"], ["coin", "Pay the store", "After you accept the price"], ["pendant", "Receive", "Delivery or collection"]];
  return { eye: "Six clear steps", t: "From browsing to gold in your hands.", labW: 292, ns: 132, size: "lg", tracks: [{ x0: X[0], x1: X[5], y: Y }],
    nodes: S.map(([g, l, c], i) => ({ x: X[i], y: Y, g, l, c, num: `0${i + 1}`, t: r2((2 + 2 * i) * HALF), fill: f(X[i]) })) };
})();
const LANES_VENDORS = (() => {
  const X = [300, 740, 1180, 1620], Y = 590, f = (x) => r2((x - X[0]) / (X[3] - X[0]));
  const S = [["store", "Register", "In a few minutes, or we set it up with you"], ["shield", "Get approved", "We review your trade licence"], ["upload", "Add your pieces", "Photos, weight, karat and your own making charge"], ["bell", "Receive requests", "You confirm the final price. They pay you directly."]];
  return { eye: "How it works", t: "Live in four steps", labW: 400, ns: 156, size: "xl", tracks: [{ x0: X[0], x1: X[3], y: Y }],
    nodes: S.map(([g, l, c], i) => ({ x: X[i], y: Y, g, l, c, num: `0${i + 1}`, t: r2((2 + 4 * i) * HALF), fill: f(X[i]) })) };
})();

const VERSIONS = {
  both: {
    title: "Get Gold — for buyers and jewellers", dur: 40.0, music: "happy-beats-business-moves-vol-11-by-ende-dot-app.mp3",
    tagline: "Bringing the UAE gold market online.",
    scenes: [["hook", 0], ["hub", 3.7, "whip"], ["lanes", 8.96, "whip"], ["compare", 14.22, "whip"], ["split", 19.49, "whip"], ["pieces", 24.75, "whip"], ["founding", 30.55, "zoomfade"], ["end", 34.76, "iris"]],
    hub: { mode: "market", eye: "What is Get Gold?", t: "A marketplace of verified UAE jewellers.", s: "Vendors own the inventory and remain the seller of record.", lh: "Verified UAE jewellers", rh: "Buyers",
      right: [["scales", "Compare stores"], ["plane", "Send a request"], ["coin", "Pay the store"], ["truck", "Delivery or collection"]], sticker: "One market, two sides" },
    lanes: LANES_BOTH, pieces: { eye: "For jewellers" },
    end: { ctas: [{ c: "g", k: "Buyers", v: "getgold.ae" }, { c: "j", k: "Jewellers", v: "getgold.ae/founding-stores" }], ctaTop: true, ar: "نضع سوق الذهب الإماراتي على الإنترنت.", en: "Bringing the UAE gold market online.", lower: true },
  },
  customers: {
    title: "Get Gold — for buyers", dur: 36.0, music: "happy-beats-business-moves-vol-11-by-ende-dot-app.mp3",
    tagline: "Bringing the UAE gold market online.",
    scenes: [["hook", 0], ["hub", 3.7, "whip"], ["lanes", 8.96, "whip"], ["compare", 14.22, "whip"], ["size", 19.49, "whip"], ["request", 23.18, "whip"], ["grid", 28.44, "zoomfade"], ["end", 32.12, "iris"]],
    hub: { mode: "market", eye: "What is Get Gold?", t: "Buy gold from verified UAE jewellers.", s: "Live gold prices. Clear breakdowns.", lh: "Verified UAE jewellers", rh: "You",
      right: [["scales", "Compare stores"], ["ruler", "Size your ring"], ["plane", "Send a request"], ["truck", "Delivery or collection"]], sticker: "Rechecked every 10s" },
    lanes: LANES_CUSTOMERS,
    grid: { l1: "Live gold prices.", l2: "Clear breakdowns.", tiles: [
      { k: "chart", t: "Live gold price", s: "Alerts at your target" },
      { k: "diamond", t: "Diamonds at real size", s: "Rings · Bangles · Diamonds" },
      { k: "truck", t: "Delivery or collection", s: "Arranged with your store" },
      { k: "bar", t: "Gold bars and coins", s: "Priced live by weight" },
      { k: "idcard", t: "Identity checks", s: "Hosted ID check" },
      { k: "eye", t: "Store visits", s: "See it first" },
      { k: "tag", t: "50% off Get Gold fee", s: "First 3 orders" },
      { k: "globe", t: "English · <span lang=\"ar\" class=\"ar\">العربية</span>", s: "Full site in Arabic" }] },
    end: { badge: "getgold.ae", ar: "نضع سوق الذهب الإماراتي على الإنترنت.", en: "Bringing the UAE gold market online." },
  },
  vendors: {
    title: "Get Gold — for jewellers", dur: 37.0, music: "happy-beats-business-moves-vol-9-by-ende-dot-app.mp3",
    tagline: "Bring your store online.",
    scenes: [["hook", 0], ["hub", 3.7, "whip"], ["lanes", 8.96, "whip"], ["pieces", 14.22, "whip"], ["split", 20.02, "whip"], ["grid", 25.28, "zoomfade"], ["founding", 28.97, "whip"], ["end", 33.7, "iris"]],
    hub: { mode: "store", eye: "For UAE gold & jewellery stores", t: "Bring your gold to customers across the UAE", s: "With live prices and clear charges.", lh: "Your store", rh: "Buyers across the UAE", sticker: "You stay the seller" },
    lanes: LANES_VENDORS, pieces: { eye: "Three ways in" },
    grid: { l1: "Gold follows the market.", l2: "Your making charge.", tiles: [
      { k: "chart", t: "Live gold price", s: "Rechecked every 10s" },
      { k: "scales", t: "Making per item", s: "Each piece its own charge" },
      { k: "tag", t: "Offers on making", s: "Discount % and end time" },
      { k: "eye", t: "Photo enhancement", s: "Accept or keep original" },
      { k: "coin", t: "Paid directly", s: "Customers pay your store" },
      { k: "store", t: "Store visit requests", s: "Buyers ask to see it first" },
      { k: "upload", t: "Excel/CSV upload", s: "1–200 products per file" },
      { k: "globe", t: "English · <span lang=\"ar\" class=\"ar\">العربية</span>", s: "Full site in Arabic" }] },
    end: { title: "Become a founding store. Free for life.", ctas: [{ c: "j", k: "Register your store", v: "getgold.ae/founding-stores" }], ctaTop: false, ar: "كن متجراً مؤسساً. مجاناً مدى الحياة.", lower: true },
  },
};

// ================= writer =================
const CSS = readFileSync(new URL("./style.css", import.meta.url), "utf8") + readFileSync(new URL("./style-new.css", import.meta.url), "utf8");
const LIB = readFileSync(new URL("./lib.js", import.meta.url), "utf8");

for (const [name, V] of Object.entries(VERSIONS)) {
  const dir = new URL(`../${name}/composition/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(new URL("assets/", dir))) {
    cpSync(new URL("assets/", FILM), new URL("assets/", dir), { recursive: true });
    for (const f of ["hyperframes.json", "package.json"]) cpSync(new URL(f, FILM), new URL(f, dir));
  }
  for (const f of ["img/tray.webp", `music/${V.music}`]) cpSync(new URL(`./extra-assets/${f}`, import.meta.url), new URL(`assets/${f}`, dir));
  writeFileSync(new URL("meta.json", dir), JSON.stringify({ id: `getgold-${name}`, name: V.title }, null, 2) + "\n");
  const audio = JSON.parse(readFileSync(new URL(`../work/audio-${name}.json`, import.meta.url), "utf8"));

  // scene slots: each clip runs until the next scene's start plus room for the out-transition
  const list = V.scenes.map(([key, start, trans], i) => {
    const next = V.scenes[i + 1], slot = r2((next ? next[1] : V.dur) - start);
    return { key, start, trans: trans || null, slot, dur: next ? r2(slot + 0.55) : slot, S: SCENES[key] };
  });
  let fidN = 0, track = 11;
  const sfx = [], cfgScenes = [], sections = [];
  list.forEach((s, i) => {
    const P = { ...s.S.params(V, s.slot), slot: s.slot };
    const fid = s.trans === "whip" ? `wbT${++fidN}` : null;
    cfgScenes.push({ key: s.key, id: s.S.id, start: s.start, orig: s.S.orig, trans: s.trans, fid, ...P });
    sections.push(`<section id="${s.S.id}" class="clip" data-start="${s.start}" data-duration="${s.dur}" data-track-index="${i}">\n${s.S.html(V)}\n</section>`);
    const off = s.start - s.S.orig;
    const list2 = typeof s.S.sfx === "function" ? s.S.sfx(P) : s.S.sfx;
    list2.forEach(([t, f, v]) => sfx.push([r2(t + off), f, v]));
    if (s.trans === "whip") sfx.push([r2(s.start - 0.08), "casino/card-slide-1.ogg", 0.5]);
    if (s.trans === "zoomfade") sfx.push([r2(s.start - 0.1), "casino/card-shove-2.ogg", 0.4]);
    if (s.trans === "iris") sfx.push([r2(s.start - 0.04), "casino/card-shove-2.ogg", 0.42]);
  });
  const audioTags = sfx.filter(([t]) => t >= 0 && t < V.dur - 0.05).sort((a, b) => a[0] - b[0])
    .map(([t, f, v], i) => `<audio id="sfx${i}" src="assets/sfx/${f}" data-start="${t}" data-track-index="${track++}" data-volume="${v}"></audio>`).join("\n");
  const fade = r2(V.dur - 0.9);
  const music = `<audio id="music" src="assets/music/${V.music}" data-start="0" data-duration="${V.dur}" data-track-index="10" data-volume="1" data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.3,"v":0.34},{"t":${fade},"v":0.34},{"t":${r2(V.dur - 0.05)},"v":0}]}]}'></audio>`;
  const filters = Array.from({ length: fidN }, (_, k) => ` <filter id="wbT${k + 1}" x="-30%" y="-5%" width="160%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur id="wbT${k + 1}g" stdDeviation="0 0"/></filter>`).join("\n");
  const CFG = { dur: V.dur, scenes: cfgScenes, audio };

  const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>${V.title}</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
${CSS}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${V.dur}" data-width="1920" data-height="1080" data-fps="30">
<svg class="defs" width="0" height="0" aria-hidden="true"><defs>
${filters}
 <filter id="wb3" x="-5%" y="-30%" width="110%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur id="wb3g" stdDeviation="0 0"/></filter>
</defs></svg>
${sections.join("\n")}
${music}
${audioTags}
</div>
<script src="assets/vendor/motion-blur.js"></script>
<script>
${LIB.replace("/*__CFG__*/", JSON.stringify(CFG))}
</script>
</body>
</html>
`;
  writeFileSync(new URL("index.html", dir), html);
  console.log(name, (html.length / 1024).toFixed(1) + " KB", "scenes:", list.map((s) => `${s.key}@${s.start}`).join(" "), "sfx:", sfx.length);
}
