// Generates composition/index.html for the Get Gold feature film.
// Everything is static HTML + one paused GSAP timeline; loops here only expand markup.
import { writeFileSync, readFileSync } from "node:fs";

const OUT = new URL("../composition/index.html", import.meta.url);
const AUDIO = JSON.parse(readFileSync(new URL("../composition/assets/audio-data.js", import.meta.url), "utf8").replace(/^[\s\S]*?window\.GG_AUDIO=/, "").replace(/;\s*$/, ""));

// ---------- helpers ----------
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r2 = (x) => Math.round(x * 100) / 100;

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
};
const glyph = (k, cls = "glyph") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[k]}</svg>`;

const FALCON = `<svg viewBox="0 0 230 130" fill="none" stroke="#202722" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M32 74c30-10 72-13 110-7 20 3 37 0 50-8l13-5-7 11c-8 10-28 18-58 20-30 2-70 0-108-11z" fill="#FCFAF7"/><path d="M96 66c5-27 25-50 56-60-10 21-18 41-22 61" fill="#FCFAF7"/><path d="M112 68C92 44 72 26 40 17c15 21 30 38 50 52" fill="#FCFAF7"/><path d="M32 74 9 63l4 14-8 10 28-8"/><path d="M193 59c4-6 11-6 14-2"/><circle cx="197" cy="61" r="1.6" fill="#202722"/><path d="M120 20c4 10 6 22 6 34M136 14c-2 12-4 24-4 38"/></svg>`;
const DHOW = `<svg viewBox="0 0 270 190" fill="none" stroke="#202722" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 122 244 114c-8 26-30 38-70 40H72c-26-2-44-12-52-32z" fill="#FCFAF7"/><path d="M132 120 120 18"/><path d="M120 18c44 20 84 60 108 90L60 118c20-36 40-70 60-100z" fill="#FCFAF7"/><path d="M120 18 106 10l12-4"/><path d="M60 140h150"/><path d="M0 172q16-11 32 0t32 0 32 0 32 0 32 0 32 0 32 0 32 0"/></svg>`;

function starburst(points = 16, outer = 100, inner = 84) {
  const p = [];
  for (let i = 0; i < points * 2; i++) { const r = i % 2 ? inner : outer; const a = (Math.PI * i) / points - Math.PI / 2; p.push(`${r2(100 + r * Math.cos(a))},${r2(100 + r * Math.sin(a))}`); }
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><polygon points="${p.join(" ")}" fill="#E9BD50"/></svg>`;
}

// ---------- reusable markup ----------
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
function orbit(id, R) {
  let arms = "";
  ORBIT_ICONS.forEach((k, i) => {
    const a = (360 / ORBIT_ICONS.length) * i;
    const style = ["t-gold", "t-jade", "t-bone"][i % 3];
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

function card(s, slot) {
  return `<article id="card${s.k}" class="ccard" style="left:${44 + slot * 374}px">
  <div class="cimg"><img src="assets/img/${s.img}.webp" alt=""><span id="badge${s.k}" class="cbadge">Lowest final total</span></div>
  <div class="cbody">
    <p class="ceye">Store ${s.k} · ${s.em}</p>
    <h3 class="cname">${s.name}</h3>
    <p class="cmeta">22K · 10g · AED 444.04/g</p>
    <div class="cfinal"><p class="cfl">Estimated final total</p><p class="cfv">${aed(s.total)}</p><p class="cfs">Get Gold Value Score: ${s.score}/100</p></div>
    <dl class="crows"><div><dt>Gold value</dt><dd>${aed(s.gold)}</dd></div><div><dt>Making after discount</dt><dd>${aed(s.mk)}</dd></div><div><dt>Get Gold fee</dt><dd>${aed(s.fee)}</dd></div><div><dt>VAT (5%)</dt><dd>${aed(s.vat)}</dd></div></dl>
  </div></article>`;
}

function cursor(id) {
  return `<div id="${id}" class="cursor" data-layout-allow-occlusion data-layout-ignore><span id="${id}-ring" class="cring"></span><svg viewBox="0 0 32 40" width="46" height="58"><path d="M3 2v31l8.4-7.6 5.2 11.8 5.6-2.5-5.2-11.6H28z" fill="#FCFAF7" stroke="#202722" stroke-width="2.4" stroke-linejoin="round"/></svg></div>`;
}

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

const studioBg = (id, seed) => `<div class="studio" data-layout-ignore><div class="studio-glow"></div><div class="studio-arc"></div>${stars(id, 46, seed)}</div>`;

// ---------- scenes ----------
const S1 = `<section id="s1" class="clip" data-start="0" data-duration="3.95" data-track-index="0">
 <div id="s1in" class="inner cosmos">
  <div class="nebula" data-layout-ignore></div>
  ${stars("stars1", 130, 7)}
  ${orbit("orb1", 560)}
  <div id="flash1" class="flash" data-layout-ignore></div>
  <p class="hand meet"><span id="meet">Meet</span></p>
  <div class="lockup1">
   <div id="rg1" class="rgwrap" data-layout-ignore><div class="ringglow"></div></div>
   <div id="ring1" class="ringsprite" data-layout-ignore></div>
   <div id="wm1" class="wordmark wm-big" data-hf-motion-blur='{"samplesPerFrame": 10}'>GET GOLD</div>
   <div id="stripe1" class="stripe dark"><i></i><i></i><i></i></div>
   <p id="tag1" class="tagline"><span>Bringing</span> <span>the</span> <span>UAE</span> <span>gold</span> <span>market</span> <span>online.</span></p>
   <div id="burst1" class="burst" data-layout-allow-occlusion>${starburst()}<span>UAE</span></div>
  </div>
 </div>
</section>`;

const S2 = `<section id="s2" class="clip" data-start="3.70" data-duration="5.45" data-track-index="1">
 <div id="s2in" class="inner">
  <div id="ui2" class="uiscene">
   ${studioBg("stars2", 21)}
   <div id="ghost2" class="ghostpanel" data-layout-ignore><p class="gp-l">Live 24K reference</p><p class="gp-v">AED 482.65/g</p><p class="gp-s">Rechecked every 10s</p></div>
   <div class="persp"><div id="win2" class="window">
    ${chrome("getgold.ae/compare")}
    ${siteHeader("GetGold Compare")}
    <div class="hero2"><div><p class="h2eye">Smart cross-store comparison</p><h1 class="h2t">GetGold Compare</h1></div>
     <div class="rank"><span class="rank-l">Rank by</span><span id="pillTotal" class="pill">Lowest final total</span><span class="pill">Lowest making charge</span></div></div>
    <p class="matches">Matches across different stores · 4 stores · Gold reference AED 482.65/g · 22K AED 444.04/g</p>
    <div class="cards">${STORES.map((s, i) => card(s, i)).join("")}</div>
    ${cursor("cur2")}
   </div></div>

   <div id="lens" class="lens" data-layout-allow-overlap data-layout-allow-occlusion><div id="lensIn" class="lens-in">
      <p class="lz-h" data-layout-allow-overlap data-layout-allow-occlusion>Store C · Dubai</p>
      ${[["Gold value", STORES[2].gold], ["Making after discount", STORES[2].mk], ["Get Gold fee", STORES[2].fee], ["VAT (5%)", STORES[2].vat]].map(([l, v]) => `<div class="lz-r"><span data-layout-allow-overlap data-layout-allow-occlusion>${l}</span><b data-layout-allow-overlap data-layout-allow-occlusion>${aed(v)}</b></div>`).join("")}
      <div class="lz-r lz-t"><span data-layout-allow-overlap data-layout-allow-occlusion>Estimated final total</span><b data-layout-allow-overlap data-layout-allow-occlusion>${aed(STORES[2].total)}</b></div>
    </div><span class="lens-shine"></span></div>
   <div id="stk2" class="sticker stk-a" data-layout-allow-occlusion data-layout-allow-overlap data-hf-motion-blur='{"samplesPerFrame": 8}'>Every charge explained</div>
  </div>
  ${chapter("ch2", "scales", "GetGold Compare", "Smart cross-store comparison", FALCON)}
 </div>
</section>`;

const SIZE_STEPS = ["51", "52", "53", "54"];
const S3 = `<section id="s3" class="clip" data-start="8.96" data-duration="3.89" data-track-index="2">
 <div id="s3in" class="inner">
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
      <div class="odo"><div id="odoCol" class="odo-col">${SIZE_STEPS.map((n) => `<span>${n}</span>`).join("")}</div></div>
      <p class="sz-intl">International size (EU / ISO)</p>
      <div class="sz-conv"><span id="cv1">US 7</span><span id="cv2">Indian 14</span><span id="cv3">Diameter 17.3 mm</span></div>
      <div id="saveBtn" class="sz-save"><span id="saveTick" class="tick">✓</span><span>Save as my size (EU 54)</span></div>
     </div>
    </div>
    <div id="stk3" class="sticker stk-b" data-layout-allow-occlusion data-layout-allow-overlap>Match a ring on screen</div>
    ${cursor("cur3")}
   </div></div>
  </div>
  ${chapter("ch3", "ruler", "Size guide", "Rings · Bangles · Diamonds", DHOW)}
 </div>
</section>`;

const TYPED = "22K bangle with a Khaleeji pattern, about 20 g";
const chips = (arr, sel, idp) => arr.map((c) => `<span${c === sel ? ` id="${idp}"` : ""} class="chip">${c}</span>`).join("");
const OFFERS = [
  { k: "A", em: "Dubai", w: "20.4 g", mk: 720, cert: 45 },
  { k: "C", em: "Dubai", w: "19.8 g", mk: 640, cert: 60 },
  { k: "D", em: "Abu Dhabi", w: "20.1 g", mk: 810, cert: 50 },
];
const S4 = `<section id="s4" class="clip" data-start="12.65" data-duration="5.65" data-track-index="3">
 <div id="s4in" class="inner">
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
   <div id="stk4" class="sticker stk-c" data-layout-allow-occlusion data-layout-allow-overlap>Send one request</div>
  </div>
  ${chapter("ch4", "plane", "Get Gold Request", "Can’t find the piece?", FALCON)}
 </div>
</section>`;

const TILES = [
  { k: "chart", t: "Gold price", s: "Rechecked every 10s", price: true },
  { k: "diamond", t: "Diamonds at real size", s: "Rings · Bangles · Diamonds" },
  { k: "truck", t: "Delivery or collection", s: "Arranged with your store" },
  { k: "bar", t: "Gold bars and coins", s: "Priced live by weight" },
  { k: "idcard", t: "Identity checks", s: "Hosted ID check" },
  { k: "eye", t: "Store visits", s: "See it first" },
  { k: "upload", t: "Excel/CSV upload", s: "1–200 products per file" },
  { k: "globe", t: "English · <span lang=\"ar\" class=\"ar\">العربية</span>", s: "Full site in Arabic" },
];
const SPARK = (() => { // real recorded closes: 519.85 (9 Sep) → 482.65 (22 Oct), interpolated with gentle variation
  const R = mulberry32(5), pts = []; const n = 24;
  for (let i = 0; i < n; i++) { const t = i / (n - 1); const v = 519.85 + (482.65 - 519.85) * t + (i && i < n - 1 ? (R() - 0.5) * 7 : 0); pts.push([r2(4 + t * 292), r2(6 + (523.5 - v) / (523.5 - 479.25) * 52)]); }
  return pts.map((p) => p.join(",")).join(" ");
})();
const S5 = `<section id="s5" class="clip" data-start="17.85" data-duration="4.15" data-track-index="4">
 <div id="s5in" class="inner bonebg">
  <div class="dotgrid" data-layout-ignore></div>
  <div class="arcs" data-layout-ignore><i></i><i></i><i></i></div>
  <div class="s5head"><h2 class="s5l"><span id="hl1">Live gold prices.</span></h2><h2 class="s5l"><span id="hl2" class="mk"><span id="marker" class="marker"></span><span class="mk-t">Clear breakdowns.</span></span></h2></div>
  <div class="gridpersp"><div id="grid" class="grid">${TILES.map((t, i) => `<div class="tile tile${i}"><span class="ti ${i % 2 ? "ti-g" : "ti-j"}">${glyph(t.k)}</span><p class="tt">${t.t}</p>${t.price ? `<p class="tp">AED 482.65/g</p><svg class="spark" viewBox="0 0 300 64"><polyline id="spark" points="${SPARK}" fill="none" stroke="#B97820" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}<p class="ts">${t.s}</p></div>`).join("")}</div></div>
 </div>
</section>`;

const S6 = `<section id="s6" class="clip" data-start="21.59" data-duration="2.91" data-track-index="5">
 <div id="s6in" class="inner cosmos">
  <div class="nebula" data-layout-ignore></div>
  ${stars("stars6", 130, 91)}
  ${orbit("orb6", 860)}
  <div class="lockup6">
   <div id="rg6" class="rgwrap" data-layout-ignore><div class="ringglow g6"></div></div>
   <div id="ring6" class="ringsprite r6" data-layout-ignore></div>
   <div id="wm6" class="wordmark wm-end" data-hf-motion-blur='{"samplesPerFrame": 10}'>GET GOLD</div>
   <div id="stripe6" class="stripe dark s6"><i></i><i></i><i></i></div>
   <div id="badge6" class="sticker badge6" data-layout-allow-occlusion>getgold.ae</div>
   <p id="ar6" class="ar-line" lang="ar" dir="rtl"><span>نضع سوق الذهب الإماراتي على الإنترنت.</span></p>
   <p id="en6" class="en-line">Bringing the UAE gold market online.</p>
  </div>
 </div>
 <div id="irisRing" class="iris-ring" data-layout-ignore></div>
</section>`;

// ---------- audio ----------
let track = 11; const sfx = [];
const A = (t, file, vol, id) => { sfx.push(`<audio id="${id || "sfx" + sfx.length}" src="assets/sfx/${file}" data-start="${t}" data-track-index="${track++}" data-volume="${vol}"></audio>`); };
A(1.56, "impact/impactSoft_medium_001.ogg", 0.7); A(1.6, "impact/impactBell_heavy_000.ogg", 0.5); A(1.84, "interface/drop_002.ogg", 0.6);
A(3.62, "casino/card-slide-1.ogg", 0.5); A(4.7, "casino/card-shove-2.ogg", 0.42);
[5.28, 5.54, 5.8, 6.07].forEach((t, i) => A(t, `interface/drop_00${[1, 2, 3, 1][i]}.ogg`, 0.5)); // beat-grid card landings
A(6.86, "ui/mouseclick1.ogg", 0.85); A(6.92, "casino/card-slide-5.ogg", 0.42); A(7.38, "ui/rollover2.ogg", 0.65); A(7.9, "impact/impactSoft_medium_002.ogg", 0.7);
A(8.86, "casino/card-slide-1.ogg", 0.5); A(9.7, "casino/card-shove-2.ogg", 0.42); A(10.3, "impact/impactSoft_medium_003.ogg", 0.65);
[10.54, 10.71, 10.88].forEach((t) => A(t, "interface/click_003.ogg", 0.55)); A(11.6, "ui/mouseclick1.ogg", 0.85); A(11.66, "interface/bong_001.ogg", 0.55);
A(12.55, "casino/card-slide-1.ogg", 0.5); A(13.36, "casino/card-shove-2.ogg", 0.4);
[13.7, 14.22, 14.76].forEach((t) => A(t, "ui/mouseclick1.ogg", 0.7));
const TYPE_T0 = 14.84, TYPE_DT = 0.0165; // 45 characters in ~0.75 s
const KEYS = ["001", "003", "005", "007", "009", "011", "013", "015", "017", "019", "021", "023"];
for (let i = 0, k = 0; i < TYPED.length; i += 3, k++) A(r2(TYPE_T0 + i * TYPE_DT), `keyboard/keypress-${KEYS[k % KEYS.length]}.wav`, 0.42);
A(15.81, "ui/mouseclick1.ogg", 0.85); A(16.0, "impact/impactSoft_medium_004.ogg", 0.65);
[16.34, 16.86, 17.39].forEach((t) => A(t, "casino/card-slide-5.ogg", 0.48));
A(17.91, "casino/card-fan-1.ogg", 0.55); A(18.96, "impact/impactGlass_light_002.ogg", 0.45);
A(21.55, "casino/card-shove-2.ogg", 0.42); A(22.6, "impact/impactSoft_medium_001.ogg", 0.6); A(22.65, "impact/impactBell_heavy_003.ogg", 0.6); A(22.93, "interface/drop_002.ogg", 0.55);

const MUSIC = `<audio id="music" src="assets/music/happy-beats-business-moves-vol-11-by-ende-dot-app.mp3" data-start="0" data-duration="24.5" data-track-index="10" data-volume="1" data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.3,"v":0.34},{"t":23.6,"v":0.34},{"t":24.45,"v":0}]}]}'></audio>`;

// ---------- styles ----------
const CSS = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const TL = readFileSync(new URL("./timeline.js", import.meta.url), "utf8")
  .replace("/*__STORES__*/", JSON.stringify({ byTotal, order: STORES.map((s) => s.k) }))
  .replace("/*__TYPED__*/", JSON.stringify({ n: TYPED.length, t0: TYPE_T0, dt: TYPE_DT }))
  .replace("/*__AUDIO__*/", JSON.stringify({ bass: AUDIO.bass, treble: AUDIO.treble }))
  .replace("/*__FLIGHTS__*/", JSON.stringify(Object.fromEntries(Object.entries(FLIGHTS).map(([k, v]) => [k, { pts: v.pts, clip: v.clip }]))));

const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>Get Gold — feature film</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
${CSS}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="24.5" data-width="1920" data-height="1080" data-fps="30">
<svg class="defs" width="0" height="0" aria-hidden="true"><defs>
 <filter id="wb1" x="-30%" y="-5%" width="160%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur id="wb1g" stdDeviation="0 0"/></filter>
 <filter id="wb2" x="-30%" y="-5%" width="160%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur id="wb2g" stdDeviation="0 0"/></filter>
 <filter id="wb4" x="-30%" y="-5%" width="160%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur id="wb4g" stdDeviation="0 0"/></filter>
 <filter id="wb3" x="-5%" y="-30%" width="110%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur id="wb3g" stdDeviation="0 0"/></filter>
</defs></svg>
${S1}
${S2}
${S3}
${S4}
${S5}
${S6}
${MUSIC}
${sfx.join("\n")}
</div>
<script src="assets/vendor/motion-blur.js"></script>
<script>
${TL}
</script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log("wrote", OUT.pathname, (html.length / 1024).toFixed(1) + " KB", "sfx:", sfx.length);
