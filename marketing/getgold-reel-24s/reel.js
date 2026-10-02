/*
 * GetGold.ae reel: stage and timeline.
 *
 * One deterministic timeline. renderAt(t) sets every element's transform and
 * opacity from t alone (seconds, 0 to 24). There are no CSS transitions or
 * animations, so the preview player (continuous t) and the MP4 export
 * (t = frame / 30) show exactly the same picture for the same moment.
 *
 * Stage is 1080 x 1920. Critical copy and branding stay inside
 * x 162 to 918 (central 70%, which also keeps the right 15% clear) and
 * y 288 to 1498 (below the top 15%, above the bottom 22%).
 */
(function () {
  "use strict";

  const W = 1080;
  const H = 1920;
  const FPS = 30;
  const DURATION = 24;
  const FRAMES = FPS * DURATION;
  const SAFE = { left: 162, right: 918, top: 288, bottom: 1498 };

  const CFG = Object.assign(
    { logo: null, ring: null, ringFit: "cover", screenshot: null, music: null, voiceover: null, voiceoverStart: 1.0 },
    window.REEL_ASSETS || {},
  );

  // Brand photograph from getgold.ae (public/images/uae-heritage-hero.webp).
  // Crops are [x, y, width] in source pixels; height follows each card's
  // aspect ratio, so the photo is never stretched.
  const HERO = { src: "assets/brand/uae-heritage-hero.webp", w: 1536, h: 1024 };
  const CROPS = {
    bangleTall: [773, 0, 377], // 400 x 700 card
    necklaceSquare: [1150, 400, 386], // 330 x 330 card
    earrings: [760, 492, 425], // 4:5 cards
    bangle: [748, 0, 425],
    necklace: [1150, 330, 386],
  };

  const SCENES = [
    { id: 1, name: "The hook", start: 0, end: 3 },
    { id: 2, name: "Discovery", start: 3, end: 7 },
    { id: 3, name: "The marketplace", start: 7, end: 12 },
    { id: 4, name: "Exploration", start: 12, end: 17 },
    { id: 5, name: "Brand and action", start: 17, end: 24 },
  ];

  // Headline copy, exactly as briefed. Times: entrance start and exit start.
  const HEADLINES = [
    { id: "h1", lines: ["Your next", "gold piece?"], top: 1220, tin: 0.25, tout: 2.6 },
    { id: "h2", lines: ["Discover", "your style."], top: 1220, tin: 3.35, tout: 6.5 },
    { id: "h3", lines: ["UAE jewellers.", "One marketplace."], top: 392, tin: 7.3, tout: 11.4 },
    { id: "h4", lines: ["Explore the", "collection."], top: 1220, tin: 12.2, tout: 14.05 },
    { id: "h5", lines: ["Find your", "next piece."], top: 1220, tin: 14.6, tout: 16.5 },
  ];
  const HL_OUT = 0.35;

  /* ---------- easing ---------- */

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const E = {
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    out: (k) => 1 - Math.pow(1 - k, 3),
    sine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  };
  const prog = (t, a, b, ease = E.inOut) => ease(clamp((t - a) / (b - a)));
  const mix = (r1, r2, k) => ({ x: lerp(r1.x, r2.x, k), y: lerp(r1.y, r2.y, k), w: lerp(r1.w, r2.w, k) });

  /* ---------- DOM helpers ---------- */

  let stage;
  const els = {};
  const state = { t: 0, warnings: [], slots: {}, logoW: 478, logoH: 100, logoIsImage: false, scrollMax: 0 };

  function div(cls, parent, w, h) {
    const d = document.createElement("div");
    d.className = cls;
    if (w != null) d.style.width = w + "px";
    if (h != null) d.style.height = h + "px";
    parent.appendChild(d);
    return d;
  }

  function place(el, x, y, s, o) {
    el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(5)})`;
    el.style.opacity = clamp(o).toFixed(4);
    el.style.visibility = o > 0.002 ? "visible" : "hidden";
  }

  // A rect {x, y, w} for an element of base size w0 x h0.
  function placeRect(c, r, o) {
    place(c.el, r.x, r.y, r.w / c.w0, o);
  }

  function grow(r, k, aspect) {
    const h = r.w * aspect;
    return { x: r.x - (r.w * (k - 1)) / 2, y: r.y - (h * (k - 1)) / 2, w: r.w * k };
  }

  function placeholder(parent, title, note) {
    const ph = div("ph", parent);
    const inner = div("ph-in", ph);
    div("ph-k", inner).textContent = title;
    div("ph-v", inner).textContent = note;
    return ph;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "sync";
      img.onload = () => {
        (img.decode ? img.decode() : Promise.resolve()).then(() => resolve(img), () => resolve(img));
      };
      img.onerror = () => reject(new Error("Could not load " + src));
      img.src = src;
    });
  }

  function cropCard(id, w0, h0, crop, heroImg, extraCls) {
    const el = div("el card" + (extraCls ? " " + extraCls : ""), stage, w0, h0);
    el.id = id;
    const media = div("media", el);
    const [cx, cy, cw] = crop;
    const k = w0 / cw;
    const ch = (cw * h0) / w0;
    if (cx < 0 || cy < 0 || cx + cw > HERO.w + 0.5 || cy + ch > HERO.h + 0.5) {
      state.warnings.push(`Crop for ${id} leaves the source photo`);
    }
    const img = heroImg.cloneNode();
    img.alt = "";
    Object.assign(img.style, {
      position: "absolute",
      left: -cx * k + "px",
      top: -cy * k + "px",
      width: HERO.w * k + "px",
      height: HERO.h * k + "px",
      transformOrigin: `${(cx + cw / 2) * k}px ${(cy + ch / 2) * k}px`,
    });
    media.appendChild(img);
    return { el, media, img, w0, h0, aspect: h0 / w0 };
  }

  /* ---------- slots (supplied assets) ---------- */

  function fillRing(c, img) {
    c.media.innerHTML = "";
    c.el.classList.toggle("cutout", !!img && CFG.ringFit === "contain");
    if (img) {
      img.alt = "";
      img.className = "slot-img " + (CFG.ringFit === "contain" ? "fit-contain" : "fit-cover");
      c.media.appendChild(img);
      c.img = img;
    } else {
      placeholder(c.media, "Ring photo", "Awaiting asset");
      c.img = null;
    }
  }

  function fillScreen(img) {
    const screen = els.screen;
    screen.innerHTML = "";
    state.scrollMax = 0;
    if (img) {
      img.alt = "";
      img.className = "shot";
      screen.appendChild(img);
      const sw = 438;
      const sh = (img.naturalHeight / img.naturalWidth) * sw;
      const overflow = Math.max(0, sh - 948);
      // One short, controlled scroll, only if the capture is taller than the screen.
      state.scrollMax = Math.min(overflow, 560);
      els.shot = img;
    } else {
      placeholder(screen, "Marketplace screenshot", "Awaiting asset");
      els.shot = null;
    }
  }

  function fillLogo(img) {
    const logo = els.logo;
    logo.innerHTML = "";
    if (img) {
      const maxH = 112;
      const maxW = 560;
      let h = maxH;
      let w = (img.naturalWidth / img.naturalHeight) * h;
      if (w > maxW) {
        w = maxW;
        h = (img.naturalHeight / img.naturalWidth) * w;
      }
      img.alt = "GetGold";
      img.className = "logo-img";
      img.style.width = w + "px";
      img.style.height = h + "px";
      logo.appendChild(img);
      state.logoW = w;
      state.logoH = h;
      state.logoIsImage = true;
    } else {
      const span = document.createElement("span");
      span.className = "wordmark";
      span.textContent = "GET GOLD";
      logo.appendChild(span);
      state.logoW = span.offsetWidth;
      state.logoH = 100;
      state.logoIsImage = false;
    }
    logo.dataset.qa = "logo";
  }

  function currentScale() {
    const r = stage.getBoundingClientRect();
    return r.width / W || 1;
  }

  async function trySlot(key, path) {
    if (!path) return null;
    try {
      return await loadImage(path);
    } catch (e) {
      state.warnings.push(`${key}: ${e.message}. Showing the placeholder.`);
      return null;
    }
  }

  /* ---------- build ---------- */

  function buildHeadline(h) {
    const g = div("el hl", stage, 756);
    g.id = h.id;
    const rule = div("rule", g);
    const lines = h.lines.map((txt) => {
      const ln = div("line", g);
      const span = document.createElement("span");
      span.textContent = txt;
      span.dataset.qa = "copy";
      span.dataset.copy = h.lines.join(" ");
      ln.appendChild(span);
      return ln;
    });
    return { ...h, el: g, rule, lines };
  }

  async function build(root) {
    stage = root;
    stage.innerHTML = "";
    div("bg", stage);

    const hero = await loadImage(HERO.src);

    // Scene 2 grid (left tall, right column) and the ring that carries over from scene 1.
    els.bangleTall = cropCard("bangleTall", 400, 700, CROPS.bangleTall, hero);
    els.necklaceSq = cropCard("necklaceSq", 330, 330, CROPS.necklaceSquare, hero);
    els.ring = { el: div("el card", stage, 756, 756), w0: 756, h0: 756, aspect: 1 };
    els.ring.el.id = "ring";
    els.ring.media = div("media", els.ring.el);

    // Scene 3 phone.
    const phone = div("el phone", stage, 470, 980);
    phone.id = "phone";
    div("side side-a", phone);
    div("side side-b", phone);
    div("side side-c", phone);
    els.screen = div("screen", phone);
    els.phone = { el: phone, w0: 470, h0: 980 };

    // Scene 4 carousel; the same cards form the end composition.
    els.carEarrings = cropCard("carEarrings", 560, 700, CROPS.earrings, hero);
    els.carBangle = cropCard("carBangle", 560, 700, CROPS.bangle, hero);
    els.carNecklace = cropCard("carNecklace", 560, 700, CROPS.necklace, hero);

    els.headlines = HEADLINES.map(buildHeadline);

    // Scene 5 copy.
    els.goldRule = div("el gold-rule", stage, 72, 3);
    els.url = div("el url", stage, 756);
    els.url.textContent = "getgold.ae";
    els.url.dataset.qa = "copy";
    els.url.dataset.copy = "getgold.ae";
    els.button = div("el cta", stage, 420, 116);
    const label = document.createElement("span");
    label.textContent = "Explore now";
    label.dataset.qa = "copy";
    label.dataset.copy = "Explore now";
    els.button.appendChild(label);

    els.logo = div("el logo", stage);

    const [logoImg, ringImg, shotImg] = await Promise.all([
      trySlot("logo", CFG.logo),
      trySlot("ring", CFG.ring),
      trySlot("screenshot", CFG.screenshot),
    ]);
    state.slots = { logo: !!logoImg, ring: !!ringImg, screenshot: !!shotImg };
    fillRing(els.ring, ringImg);
    fillScreen(shotImg);
    fillLogo(logoImg);

    const imgs = Array.from(stage.querySelectorAll("img"));
    await Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
    renderAt(0);
  }

  /* ---------- the timeline ---------- */

  function renderAt(tIn) {
    const t = clamp(tIn, 0, DURATION);
    state.t = t;

    // Logo: discreet top-left from frame one. For the end lockup it fades out
    // there and fades in at the centre, so it never travels across the cards.
    {
      const small = state.logoIsImage ? 46 / state.logoH : 0.46;
      const fx = 540 - state.logoW / 2;
      const fy = 888 + (100 - state.logoH) / 2;
      if (t < 17.4) {
        place(els.logo, 162, 300, small, 1 - prog(t, 16.95, 17.3));
      } else {
        const k = prog(t, 17.55, 18.1, E.out);
        const s = lerp(0.96, 1, k);
        place(els.logo, fx + (state.logoW * (1 - s)) / 2, fy + 24 * (1 - k), s, k);
      }
    }

    // Scene 1 to 2: the ring pushes in gently, then settles into the grid.
    {
      const c = els.ring;
      const R1 = { x: 162, y: 380, w: 756 };
      const R2 = { x: 588, y: 400, w: 330 };
      const push = (u) => 1 + 0.055 * (1 - Math.pow(1 - clamp(u / 3.0), 2));
      let r;
      if (t < 3.0) r = grow(R1, push(t), 1);
      else r = mix(grow(R1, push(3.0), 1), R2, prog(t, 3.0, 3.6));
      const out = prog(t, 6.62, 7.08);
      r.y -= 40 * out;
      placeRect(c, r, 1 - out);
      if (c.img) c.img.style.transform = `scale(${1 + 0.035 * prog(t, 3.6, 7.0, E.sine)})`;
    }

    // Scene 2: bangle and necklace join 0.2 s apart.
    {
      const c = els.bangleTall;
      const kin = prog(t, 3.2, 3.8, E.out);
      const out = prog(t, 6.7, 7.15);
      placeRect(c, { x: 162 - 80 * (1 - kin), y: 400 - 40 * out, w: 400 }, kin * (1 - out));
      c.img.style.transform = `scale(${1 + 0.035 * prog(t, 3.8, 7.0, E.sine)})`;
    }
    {
      const c = els.necklaceSq;
      const kin = prog(t, 3.4, 4.0, E.out);
      const out = prog(t, 6.66, 7.12);
      placeRect(c, { x: 588, y: 770 + 80 * (1 - kin) - 40 * out, w: 330 }, kin * (1 - out));
      c.img.style.transform = `scale(${1 + 0.035 * prog(t, 4.0, 7.0, E.sine)})`;
    }

    // Scene 3: upright, front-facing phone; one short scroll if the capture allows.
    {
      const kin = prog(t, 6.85, 7.5, E.out);
      const out = prog(t, 11.7, 12.15);
      const drift = state.scrollMax > 0 ? 0 : 14 * prog(t, 7.6, 11.75, E.sine);
      place(els.phone.el, 305 - 380 * out, 680 + 180 * (1 - kin) - drift, 1, kin * (1 - out));
      if (els.shot) {
        const s = state.scrollMax * prog(t, 8.7, 10.6);
        els.shot.style.transform = `translateY(${-s.toFixed(2)}px)`;
      }
    }

    // Scene 4: horizontal browsing, then the cards become the end composition.
    {
      const STEP = 600;
      const enter = prog(t, 11.85, 12.5, E.out);
      const fade = prog(t, 11.85, 12.25, E.out);
      const off = lerp(-720, 0, enter) + STEP * prog(t, 13.5, 14.1) + STEP * prog(t, 15.2, 15.8);
      const cards = [els.carEarrings, els.carBangle, els.carNecklace];
      const finals = [
        { x: 708, y: 552.5, w: 210 },
        { x: 162, y: 552.5, w: 210 },
        { x: 390, y: 440, w: 300 },
      ];
      cards.forEach((c, i) => {
        const d = (i * STEP - off) / STEP;
        const sN = 1 - 0.08 * Math.min(1, Math.abs(d));
        const oN = (1 - 0.3 * Math.min(1, Math.abs(d))) * fade;
        let r = { x: 260 + i * STEP - off + 280 * (1 - sN), y: 450 + 350 * (1 - sN), w: 560 * sN };
        let o = oN;
        if (i === 2) {
          const k = prog(t, 17.0, 17.75);
          r = mix(r, finals[2], k);
          o = lerp(oN, 1, k);
        } else if (i === 1) {
          const k = prog(t, 17.05, 17.8);
          r = mix(r, finals[1], k);
          o = lerp(oN, 1, k);
        } else if (t >= 16.9) {
          // The earrings left the frame on the first slide; they return on the right.
          const k = prog(t, 17.2, 17.85, E.out);
          r = { x: finals[0].x + 120 * (1 - k), y: finals[0].y, w: finals[0].w };
          o = k;
        }
        if (t < 11.85) o = 0;
        placeRect(c, r, o);
      });
    }

    // Headlines: rule draws in, lines fade and rise; each leaves before the next arrives.
    els.headlines.forEach((h) => {
      const on = t >= h.tin - 0.06 && t <= h.tout + HL_OUT;
      if (!on) {
        place(h.el, 162, h.top, 1, 0);
        return;
      }
      const outK = prog(t, h.tout, h.tout + HL_OUT);
      place(h.el, 162, h.top, 1, 1);
      const ruleK = prog(t, h.tin - 0.05, h.tin + 0.4, E.out);
      h.rule.style.transform = `scaleX(${ruleK.toFixed(4)})`;
      h.rule.style.opacity = (1 - outK).toFixed(4);
      h.lines.forEach((ln, i) => {
        const a = h.tin + i * 0.09;
        const k = prog(t, a, a + 0.55, E.out);
        ln.style.opacity = (k * (1 - outK)).toFixed(4);
        ln.style.transform = `translateY(${((1 - k) * 38 - outK * 14).toFixed(2)}px)`;
      });
    });

    // Scene 5: website and call to action; everything settled by 18.45 s.
    {
      const kr = prog(t, 17.85, 18.3, E.out);
      place(els.goldRule, 504, 1022, 1, kr > 0 ? 1 : 0);
      els.goldRule.style.transform += ` scaleX(${kr.toFixed(4)})`;
      const ku = prog(t, 17.75, 18.25, E.out);
      place(els.url, 162, 1052 + 30 * (1 - ku), 1, ku);
      const kb = prog(t, 17.95, 18.45, E.out);
      place(els.button, 330, 1170 + 30 * (1 - kb), 1, kb);
    }
  }

  /* ---------- QA helpers ---------- */

  function visibleOpacity(el) {
    let o = 1;
    for (let n = el; n && n !== stage; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  }

  function describe() {
    const s = currentScale();
    const sr = stage.getBoundingClientRect();
    const out = [];
    stage.querySelectorAll("[data-qa]").forEach((el) => {
      const o = visibleOpacity(el);
      const r = el.getBoundingClientRect();
      out.push({
        kind: el.dataset.qa,
        copy: el.dataset.copy || (el.dataset.qa === "logo" ? "logo" : el.textContent),
        opacity: +o.toFixed(3),
        rect: {
          x: +((r.left - sr.left) / s).toFixed(1),
          y: +((r.top - sr.top) / s).toFixed(1),
          w: +(r.width / s).toFixed(1),
          h: +(r.height / s).toFixed(1),
        },
        clipped: el.scrollWidth > el.clientWidth + 1,
      });
    });
    return out;
  }

  /* ---------- soundtrack ---------- */

  async function fetchAudio(path) {
    if (!path) return null;
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return await window.ReelSoundtrack.decode(await res.arrayBuffer());
    } catch (e) {
      state.warnings.push(`Audio ${path}: ${e.message}`);
      return null;
    }
  }

  const audio = { buffer: null, info: null, music: null, voiceover: null, voiceoverStart: CFG.voiceoverStart };

  async function renderSoundtrack() {
    const res = await window.ReelSoundtrack.render({
      music: audio.music,
      voiceover: audio.voiceover,
      voiceoverStart: audio.voiceoverStart,
    });
    audio.buffer = res.buffer;
    audio.info = res;
    return res;
  }

  function bufferToBase64(ab) {
    const bytes = new Uint8Array(ab);
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  /* ---------- boot ---------- */

  async function loadFonts() {
    const faces = ['400 70px "GG Sans"', '600 90px "GG Sans"', '400 100px "GG Wordmark"'];
    await Promise.all(faces.map((f) => document.fonts.load(f, "GET GOLD getgold.ae Explore now?")));
    const missing = faces.filter((f) => !document.fonts.check(f));
    if (missing.length) state.warnings.push("Fonts not loaded: " + missing.join(", "));
    await document.fonts.ready;
  }

  const REEL = {
    W,
    H,
    FPS,
    DURATION,
    FRAMES,
    SAFE,
    SCENES,
    HEADLINES: HEADLINES.map(({ id, lines, tin, tout }) => ({ id, copy: lines.join(" "), tin, tout: tout + HL_OUT })),
    config: CFG,
    state,
    audio,
    renderAt,
    seekFrame: (f) => renderAt(f / FPS),
    describe,
    async init(root) {
      await loadFonts();
      await build(root);
      audio.music = await fetchAudio(CFG.music);
      audio.voiceover = await fetchAudio(CFG.voiceover);
      await renderSoundtrack();
      return REEL;
    },
    async setSlotImage(key, url) {
      const img = await loadImage(url);
      if (key === "ring") fillRing(els.ring, img);
      else if (key === "screenshot") fillScreen(img);
      else if (key === "logo") fillLogo(img);
      state.slots[key] = true;
      renderAt(state.t);
    },
    async setAudio(key, arrayBuffer) {
      audio[key] = arrayBuffer ? await window.ReelSoundtrack.decode(arrayBuffer) : null;
      return renderSoundtrack();
    },
    async setVoiceoverStart(sec) {
      audio.voiceoverStart = sec;
      return renderSoundtrack();
    },
    soundtrackWavBase64() {
      return bufferToBase64(window.ReelSoundtrack.toWav(audio.buffer));
    },
  };

  window.REEL = REEL;
})();
