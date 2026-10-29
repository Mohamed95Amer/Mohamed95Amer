(function () {
  const DATA = { stores: /*__STORES__*/, typed: /*__TYPED__*/, audio: /*__AUDIO__*/, flights: /*__FLIGHTS__*/ };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // offsetLeft/Top ignore transforms, so targets inside a tilted window resolve in the window's own plane.
  function offsetIn(el, anc) { let x = 0, y = 0; while (el && el !== anc) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x, y }; }
  function centerIn(sel, anc) { const el = $(sel), o = offsetIn(el, $(anc)); return { x: o.x + el.offsetWidth / 2, y: o.y + el.offsetHeight / 2 }; }

  function build() {
    const tl = gsap.timeline({ paused: true });
    const root = $("#root");

    // ---------- audio-reactive layer: pre-extracted bass/treble, one sample per frame ----------
    let sb = DATA.audio.bass[0], st = DATA.audio.treble[0];
    for (let f = 0; f < DATA.audio.bass.length; f++) {
      sb = sb * 0.55 + DATA.audio.bass[f] * 0.45; st = st * 0.55 + DATA.audio.treble[f] * 0.45;
      tl.set(root, { "--bass": +sb.toFixed(3), "--treb": +st.toFixed(3) }, +(f / 30).toFixed(4));
    }

    // ---------- shared moves ----------
    function twinkle(sel, t0, t1, seed) {
      const R = mulberry32(seed);
      $$(sel + " .st").forEach((el) => {
        const d = 0.45 + R() * 1.1, reps = Math.max(0, Math.floor((t1 - t0) / d) - 1);
        tl.fromTo(el, { opacity: 0.2 + R() * 0.35 }, { opacity: 1, duration: d, ease: "sine.inOut", yoyo: true, repeat: reps }, t0 + R() * 0.3);
      });
    }
    function sprite(sel, size, t0, t1, f0) {
      const el = $(sel), n = Math.round((t1 - t0) * 30);
      for (let i = 0; i < n; i++) { const fr = (f0 + i) % 96; tl.set(el, { backgroundPosition: `${-(fr % 12) * size}px ${-Math.floor(fr / 12) * size}px` }, +(t0 + i / 30).toFixed(4)); }
    }
    // Orbit: tilt is static CSS; spin rotates the plane, each face counter-rotates by the same amount so icons stay upright.
    function orbitSpin(id, t, dur, from, to, ease) {
      tl.fromTo(`#${id}-spin`, { rotation: from }, { rotation: to, duration: dur, ease, immediateRender: t < 0.01 }, t);
      $$(`.${id}-face`).forEach((el) => { const a = +el.dataset.a; tl.fromTo(el, { rotation: -a - from, rotationX: -64 }, { rotation: -a - to, rotationX: -64, duration: dur, ease, immediateRender: t < 0.01 }, t); });
    }
    function whip(outSel, inSel, t, fid, dist = 1700) {
      tl.set(outSel, { filter: `url(#${fid})` }, t - 0.12);
      tl.fromTo(outSel, { x: 0 }, { x: -dist * 0.9, duration: 0.22, ease: "power3.in", immediateRender: false }, t - 0.12);
      tl.set(inSel, { filter: `url(#${fid})` }, t - 0.02);
      tl.fromTo(inSel, { x: dist }, { x: 0, duration: 0.36, ease: "expo.out" }, t - 0.02);
      tl.fromTo(`#${fid}g`, { attr: { stdDeviation: "0 0" } }, { attr: { stdDeviation: "120 0" }, duration: 0.12, ease: "power2.in" }, t - 0.1);
      tl.to(`#${fid}g`, { attr: { stdDeviation: "0 0" }, duration: 0.28, ease: "power2.out" }, t + 0.02);
      tl.set(inSel, { filter: "none" }, t + 0.32);
    }
    function click(cur, t) {
      tl.to(cur, { scale: 0.8, duration: 0.06, ease: "power2.out", yoyo: true, repeat: 1, transformOrigin: "4px 2px" }, t - 0.03);
      tl.fromTo(cur + "-ring", { scale: 0.3, opacity: 1 }, { scale: 1.7, opacity: 0, duration: 0.45, ease: "power2.out" }, t);
    }
    function slap(sel, t, rot) {
      tl.fromTo(sel, { scale: 1.9, rotation: rot - 22, opacity: 0 }, { scale: 1, rotation: rot, opacity: 1, duration: 0.3, ease: "back.out(2)" }, t - 0.03);
    }
    function flight(id, t, dur) {
      const F = DATA.flights[id], seg = dur / (F.pts.length - 1);
      tl.set(`#${id}-doodle`, { x: F.pts[0][0], y: F.pts[0][1], rotation: F.pts[0][2] }, t);
      tl.to(`#${id}-doodle`, { keyframes: F.pts.slice(1).map((p) => ({ x: p[0], y: p[1], rotation: p[2], duration: seg, ease: "none" })) }, t);
      tl.fromTo(`#${id}-trail`, { clipPath: F.clip[0] }, { clipPath: F.clip[1], duration: dur, ease: "none" }, t);
    }
    function chapterIn(id, t) {
      tl.fromTo(`#${id}-icon`, { scale: 0.55, rotation: -14 }, { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.2)" }, t + 0.04);
      tl.fromTo(`#${id}-title`, { x: 90, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power4.out" }, t + 0.06);
      tl.fromTo(`#${id}-eye`, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t + 0.12);
    }

    // ================= S1 · cosmic hook 0.00–3.70 =================
    twinkle("#stars1", 0, 3.9, 11);
    tl.fromTo("#stars1", { scale: 1.08 }, { scale: 1, duration: 3.9, ease: "none" }, 0);
    tl.set(".orb1-pos", { x: 560 }, 0);
    tl.fromTo("#orb1", { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: "power3.out" }, 0);
    tl.fromTo(".orb1-tile", { scale: 0.4 }, { scale: 1, duration: 0.6, ease: "back.out(1.8)", stagger: 0.03 }, 0.02);
    orbitSpin("orb1", 0, 1.3, 0, 70, "none");
    orbitSpin("orb1", 1.3, 0.3, 70, 210, "power2.in");
    tl.to(".orb1-pos", { x: 0, duration: 0.3, ease: "power3.in" }, 1.3);
    tl.to(".orb1-tile", { scale: 0.15, opacity: 0, duration: 0.3, ease: "power2.in" }, 1.3);
    tl.fromTo("#meet", { clipPath: "inset(0% 100% 0% 0%)", rotation: -5 }, { clipPath: "inset(0% 0% 0% 0%)", rotation: 0, duration: 0.55, ease: "power2.out" }, 0.22);
    tl.to("#meet", { y: -70, opacity: 0, scale: 0.88, duration: 0.24, ease: "power2.in" }, 1.3);
    tl.fromTo("#flash1", { scale: 0.2, opacity: 0 }, { scale: 1.5, opacity: 1, duration: 0.16, ease: "power2.out" }, 1.46);
    tl.to("#flash1", { scale: 2.8, opacity: 0, duration: 0.7, ease: "power2.out" }, 1.62);
    tl.fromTo("#rg1", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power2.out" }, 1.5);
    tl.fromTo("#ring1", { scale: 0.12, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.62, ease: "back.out(1.5)" }, 1.5);
    sprite("#ring1", 360, 1.4, 3.95, 0);
    // beat-locked: 1.60s — wordmark slam on the bed's first strong beat
    tl.fromTo("#wm1", { scale: 1.55, opacity: 0, y: -24 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "power4.out" }, 1.58);
    tl.fromTo("#stripe1", { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out", transformOrigin: "0% 50%" }, 1.76);
    tl.fromTo("#tag1 span", { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out", stagger: 0.045 }, 1.7);
    tl.fromTo("#burst1", { scale: 0, rotation: -70 }, { scale: 1, rotation: -12, duration: 0.5, ease: "back.out(2.4)" }, 1.84);
    tl.fromTo("#burst1 svg", { rotation: 0 }, { rotation: 45, duration: 2.1, ease: "none" }, 1.85);
    tl.fromTo(".lockup1", { scale: 1 }, { scale: 1.045, duration: 2.1, ease: "none" }, 1.75);

    whip("#s1in", "#s2in", 3.7, "wb1");

    // ================= S2 · GetGold Compare 3.70–8.96 =================
    chapterIn("ch2", 3.7);
    flight("ch2", 3.7, 1.1);
    tl.to("#ch2", { scale: 7.5, opacity: 0, duration: 0.42, ease: "power3.in", transformOrigin: "455px 540px" }, 4.62);
    tl.fromTo("#ui2", { scale: 0.72 }, { scale: 1, duration: 0.7, ease: "power3.out" }, 4.72);
    tl.fromTo("#stars2", { x: 0 }, { x: -70, duration: 5.4, ease: "none" }, 3.7);
    tl.fromTo("#ghost2", { x: 40, y: 10 }, { x: -30, y: -10, duration: 4.3, ease: "sine.inOut" }, 4.7);
    tl.fromTo("#win2", { rotationY: -26, rotationX: 12, y: 90, opacity: 0, transformPerspective: 2600 }, { rotationY: -10, rotationX: 5, y: 0, opacity: 1, duration: 0.75, ease: "power3.out" }, 4.76);
    tl.to("#win2", { rotationY: -6, rotationX: 3.5, duration: 1.7, ease: "sine.inOut" }, 5.52);
    // beat-grid: cards land on the eighth-note grid 5.28 / 5.54 / 5.80 / 6.07
    DATA.stores.order.forEach((k, i) => {
      tl.fromTo(`#card${k}`, { y: 150, rotationX: -40, opacity: 0, transformPerspective: 900 }, { y: 0, rotationX: 0, opacity: 1, duration: 0.5, ease: "back.out(1.5)" }, [5.28, 5.54, 5.8, 6.07][i]);
    });
    const pill = centerIn("#pillTotal", "#win2");
    tl.fromTo("#cur2", { x: 1380, y: 940, opacity: 0 }, { x: pill.x - 6, y: pill.y - 4, opacity: 1, duration: 0.62, ease: "power3.inOut" }, 6.2);
    click("#cur2", 6.86);
    tl.to("#pillTotal", { backgroundColor: "#E9BD50", borderColor: "#E9BD50", color: "#202722", duration: 0.14 }, 6.88);
    // re-rank by lowest final total: C, A, D, B
    const old = DATA.stores.order, nu = DATA.stores.byTotal;
    old.forEach((k) => {
      const dx = (nu.indexOf(k) - old.indexOf(k)) * 374; if (!dx) return;
      tl.to(`#card${k}`, { keyframes: [{ x: dx * 0.5, y: dx < 0 ? -70 : 40, rotation: dx < 0 ? -3 : 2, duration: 0.24, ease: "power2.out" }, { x: dx, y: 0, rotation: 0, duration: 0.26, ease: "power2.in" }] }, 6.94);
    });
    tl.to("#cur2", { x: 1250, y: 900, opacity: 0, duration: 0.5, ease: "power2.in" }, 7.05);
    tl.to("#cardC", { borderColor: "#E9BD50", boxShadow: "0 0 0 5px rgba(233,189,80,0.6), 0 26px 50px rgba(32,39,34,0.18)", duration: 0.3 }, 7.3);
    tl.fromTo("#badgeC", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.36, ease: "back.out(2.5)" }, 7.32);
    // camera push + shallow depth of field on the runners-up
    tl.to("#win2", { scale: 1.1, x: 120, y: -24, rotationY: -2.5, duration: 0.95, ease: "power2.inOut" }, 7.22);
    tl.to(["#cardA", "#cardD", "#cardB"], { filter: "blur(3px)", opacity: 0.72, duration: 0.5, ease: "power2.out" }, 7.4);
    tl.fromTo("#lens", { scale: 0.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: "back.out(1.7)" }, 7.36);
    tl.fromTo("#lens", { y: 24 }, { y: -12, duration: 1.55, ease: "sine.inOut", immediateRender: false }, 7.38);
    tl.fromTo("#lensIn", { y: 22 }, { y: -10, duration: 1.5, ease: "sine.inOut" }, 7.4);
    slap("#stk2", 7.91, -5);
    tl.to("#stk2", { y: -10, rotation: -3, duration: 1, ease: "sine.inOut" }, 8.2);

    whip("#s2in", "#s3in", 8.96, "wb2");

    // ================= S3 · Size guide 8.96–12.65 =================
    chapterIn("ch3", 8.96);
    flight("ch3", 8.96, 0.85);
    tl.set("#ch3", { filter: "url(#wb3)" }, 9.64);
    tl.to("#ch3", { y: -1150, duration: 0.24, ease: "power3.in" }, 9.64);
    tl.set("#ui3", { filter: "url(#wb3)" }, 9.72);
    tl.fromTo("#ui3", { y: 1150 }, { y: 0, duration: 0.42, ease: "expo.out" }, 9.72);
    tl.fromTo("#wb3g", { attr: { stdDeviation: "0 0" } }, { attr: { stdDeviation: "0 110" }, duration: 0.12, ease: "power2.in" }, 9.66);
    tl.to("#wb3g", { attr: { stdDeviation: "0 0" }, duration: 0.28, ease: "power2.out" }, 9.8);
    tl.set("#ui3", { filter: "none" }, 10.12);
    tl.fromTo("#stars3", { x: 0 }, { x: 60, duration: 3.9, ease: "none" }, 8.96);
    tl.fromTo("#ghost3", { x: -20, y: 10 }, { x: 30, y: -10, duration: 3, ease: "sine.inOut" }, 9.7);
    tl.fromTo("#win3", { rotationY: 16, rotationX: 8, transformPerspective: 2600 }, { rotationY: 6, rotationX: 4, duration: 2.9, ease: "sine.out" }, 9.72);
    tl.fromTo("#band3", { rotation: -20 }, { rotation: 18, duration: 3, ease: "none" }, 9.7);
    slap("#stk3", 10.3, -6);
    // beat-grid: size resolves 10.54 → 11.06
    tl.fromTo("#szCircle", { scale: 0.72 }, { scale: 1, duration: 0.52, ease: "power2.inOut" }, 10.54);
    tl.fromTo("#szKnob", { x: 110 }, { x: 330, duration: 0.52, ease: "power2.inOut" }, 10.54);
    tl.fromTo("#odoCol", { y: 0 }, { y: -528, duration: 0.52, ease: "power2.inOut" }, 10.54);
    tl.to("#odoCol span:not(:last-child)", { opacity: 0, duration: 0.12 }, 11.0);
    tl.fromTo(["#cv1", "#cv2", "#cv3"], { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "back.out(2)", stagger: 0.08 }, 11.06);
    const save = centerIn("#saveBtn", "#win3");
    tl.fromTo("#cur3", { x: 1500, y: 960, opacity: 0 }, { x: save.x + 40, y: save.y - 6, opacity: 1, duration: 0.6, ease: "power3.inOut" }, 10.92);
    click("#cur3", 11.6);
    tl.to("#saveBtn", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.18 }, 11.62);
    tl.fromTo("#saveTick", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.6)" }, 11.64);
    tl.to("#cur3", { x: save.x + 220, y: save.y + 200, opacity: 0, duration: 0.5, ease: "power2.in" }, 11.95);

    whip("#s3in", "#s4in", 12.65, "wb4");

    // ================= S4 · Get Gold Request 12.65–17.91 =================
    chapterIn("ch4", 12.65);
    flight("ch4", 12.65, 0.95);
    tl.to(["#ch4-title", "#ch4-eye"], { opacity: 0, x: -40, duration: 0.2, ease: "power2.in" }, 13.24);
    tl.to("#ch4-icon", { scale: 14, duration: 0.34, ease: "power3.in" }, 13.28);
    tl.to("#ch4-icon .chg", { opacity: 0, scale: 0.6, duration: 0.14, ease: "power2.in" }, 13.26);
    tl.to("#ch4", { opacity: 0, duration: 0.2, ease: "none" }, 13.6);
    tl.fromTo("#stars4", { x: 0 }, { x: -60, duration: 5.4, ease: "none" }, 12.65);
    tl.fromTo("#win4", { y: 220, rotationX: 24, rotationY: -12, opacity: 0, transformPerspective: 2600 }, { y: 0, rotationX: 5, rotationY: -7, opacity: 1, duration: 0.55, ease: "power3.out" }, 13.5);
    tl.to("#win4", { rotationY: -4, rotationX: 3, duration: 1.8, ease: "sine.inOut" }, 14.05);
    // beat-grid: chips 13.70 / 14.22 / 14.76
    const cT = centerIn("#chipType", "#win4"), cK = centerIn("#chipK", "#win4"), cE = centerIn("#chipEm", "#win4"), sB = centerIn("#sendBtn", "#win4");
    tl.fromTo("#cur4", { x: 1300, y: 900, opacity: 0 }, { x: cT.x, y: cT.y, opacity: 1, duration: 0.42, ease: "power3.out" }, 13.3);
    click("#cur4", 13.7);
    tl.to("#chipType", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.14 }, 13.72);
    tl.to("#cur4", { x: cK.x, y: cK.y, duration: 0.4, ease: "power3.inOut" }, 13.8);
    click("#cur4", 14.22);
    tl.to("#chipK", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.14 }, 14.24);
    tl.to("#cur4", { x: cE.x, y: cE.y, duration: 0.4, ease: "power3.inOut" }, 14.32);
    click("#cur4", 14.76);
    tl.to("#chipEm", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.14 }, 14.78);
    tl.fromTo("#caret", { opacity: 1 }, { opacity: 0.1, duration: 0.26, ease: "steps(1)", yoyo: true, repeat: 9 }, 13.6);
    for (let i = 0; i < DATA.typed.n; i++) tl.set(`#tc${i}`, { display: "inline" }, +(DATA.typed.t0 + i * DATA.typed.dt).toFixed(4));
    tl.to("#cur4", { x: sB.x, y: sB.y, duration: 0.6, ease: "power3.inOut" }, 15.1);
    click("#cur4", 15.81);
    tl.to("#sendBtn", { scale: 0.95, backgroundColor: "#B97820", duration: 0.08, yoyo: true, repeat: 1 }, 15.79);
    tl.to("#win4", { scale: 0.84, x: -300, rotationY: 12, filter: "blur(3px)", duration: 0.55, ease: "power3.inOut" }, 15.92);
    tl.to("#cur4", { opacity: 0, duration: 0.2 }, 15.95);
    slap("#stk4", 16.02, -4);
    // beat-grid: offers 16.34 / 16.86 / 17.39
    [16.34, 16.86, 17.39].forEach((t, i) => tl.fromTo(`#offer${i}`, { x: 820, rotationY: -38, opacity: 0 }, { x: 0, rotationY: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t));
    tl.to("#s4in", { scale: 0.82, opacity: 0, duration: 0.3, ease: "power2.in" }, 17.82);

    // ================= S5 · everything else 17.91–21.59 =================
    tl.fromTo("#s5in", { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.36, ease: "power3.out" }, 17.86);
    tl.fromTo("#grid", { rotationX: 30, rotationZ: -7, rotationY: -8, x: 90, y: 60, scale: 0.94 }, { rotationX: 18, rotationZ: -3, rotationY: -2, x: -30, y: -10, scale: 1.04, duration: 3.7, ease: "sine.inOut" }, 17.88);
    // beat-locked: 17.91s — feature grid ripples out from the centre
    tl.fromTo("#grid .tile", { opacity: 0, scale: 0.55, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.6)", stagger: { each: 0.05, from: "center", grid: [2, 4] } }, 17.91);
    tl.fromTo("#hl1", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 17.98);
    tl.fromTo("#hl2", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 18.44);
    tl.fromTo("#marker", { scaleX: 0 }, { scaleX: 1, duration: 0.42, ease: "power2.inOut" }, 18.96);
    tl.fromTo("#spark", { strokeDashoffset: 640 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.out" }, 18.2);
    tl.fromTo(".tile0 .tp", { color: "#0B2A22" }, { color: "#B97820", duration: 0.16, yoyo: true, repeat: 1 }, 20.2);
    tl.fromTo(".arcs", { rotation: 0 }, { rotation: 12, duration: 4, ease: "none", transformOrigin: "1730px 130px" }, 17.86);
    tl.to("#s5in", { scale: 0.9, duration: 0.5, ease: "power2.in" }, 21.55);

    // ================= S6 · end card 21.59–24.50 =================
    tl.fromTo("#s6in", { clipPath: "circle(0% at 50% 52%)" }, { clipPath: "circle(75% at 50% 52%)", duration: 0.5, ease: "power3.inOut" }, 21.59);
    // gold rim riding the iris edge: circle(p%) radius = p% of sqrt(w²+h²)/√2 ≈ 1557px
    tl.fromTo("#irisRing", { width: 0, height: 0, opacity: 1 }, { width: 2336, height: 2336, duration: 0.5, ease: "power3.inOut" }, 21.59);
    tl.to("#irisRing", { opacity: 0, duration: 0.2, ease: "none" }, 21.95);
    twinkle("#stars6", 21.59, 24.5, 61);
    tl.set(".orb6-pos", { x: 0 }, 21.59);
    tl.to(".orb6-pos", { x: 860, duration: 0.85, ease: "power3.out" }, 21.66);
    tl.fromTo(".orb6-tile", { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.02 }, 21.66);
    orbitSpin("orb6", 21.59, 2.91, -40, 30, "power1.out");
    tl.fromTo("#rg6", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power2.out" }, 21.85);
    tl.fromTo("#ring6", { scale: 0.1, opacity: 0, rotation: 30 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: "back.out(1.5)" }, 21.9);
    sprite("#ring6", 300, 21.59, 24.5, 40);
    // beat-locked: 22.65s — end-card wordmark
    tl.fromTo("#wm6", { scale: 1.55, opacity: 0, y: -24 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "power4.out" }, 22.63);
    tl.fromTo("#stripe6", { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out", transformOrigin: "0% 50%" }, 22.8);
    slap("#badge6", 22.95, 7);
    tl.fromTo("#ar6 span", { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power2.inOut" }, 23.0);
    tl.fromTo("#en6", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 23.32);
    tl.fromTo(".lockup6", { scale: 1 }, { scale: 1.03, duration: 1.8, ease: "none" }, 22.65);

    window.__timelines["main"] = tl;
  }

  document.fonts.ready.then(build);
})();
