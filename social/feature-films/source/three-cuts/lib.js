(function () {
  // Per-version config injected by gen3.mjs: scene order/starts, transitions, scene params, audio data.
  const CFG = /*__CFG__*/;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // offsetLeft/Top ignore transforms, so targets inside a tilted window resolve in the window's own plane.
  function offsetIn(el, anc) { let x = 0, y = 0; while (el && el !== anc) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x, y }; }
  function centerIn(sel, anc) { const el = $(sel), o = offsetIn(el, $(anc)); return { x: o.x + el.offsetWidth / 2, y: o.y + el.offsetHeight / 2 }; }

  // ---------- shared moves, bound to a (child) timeline ----------
  function moves(tl) {
    return {
      twinkle(sel, t0, t1, seed) {
        const R = mulberry32(seed);
        $$(sel + " .st").forEach((el) => {
          const d = 0.45 + R() * 1.1, reps = Math.max(0, Math.floor((t1 - t0) / d) - 1);
          tl.fromTo(el, { opacity: 0.2 + R() * 0.35 }, { opacity: 1, duration: d, ease: "sine.inOut", yoyo: true, repeat: reps }, t0 + R() * 0.3);
        });
      },
      sprite(sel, size, t0, t1, f0) {
        const el = $(sel), n = Math.round((t1 - t0) * 30);
        for (let i = 0; i < n; i++) { const fr = (f0 + i) % 96; tl.set(el, { backgroundPosition: `${-(fr % 12) * size}px ${-Math.floor(fr / 12) * size}px` }, +(t0 + i / 30).toFixed(4)); }
      },
      // Orbit: tilt is static CSS; spin rotates the plane, each face counter-rotates by the same amount so icons stay upright.
      orbitSpin(id, t, dur, from, to, ease) {
        tl.fromTo(`#${id}-spin`, { rotation: from }, { rotation: to, duration: dur, ease, immediateRender: t < 0.01 }, t);
        $$(`.${id}-face`).forEach((el) => { const a = +el.dataset.a; tl.fromTo(el, { rotation: -a - from, rotationX: -64 }, { rotation: -a - to, rotationX: -64, duration: dur, ease, immediateRender: t < 0.01 }, t); });
      },
      click(cur, t) {
        tl.to(cur, { scale: 0.8, duration: 0.06, ease: "power2.out", yoyo: true, repeat: 1, transformOrigin: "4px 2px" }, t - 0.03);
        tl.fromTo(cur + "-ring", { scale: 0.3, opacity: 1 }, { scale: 1.7, opacity: 0, duration: 0.45, ease: "power2.out" }, t);
      },
      slap(sel, t, rot) {
        tl.fromTo(sel, { scale: 1.9, rotation: rot - 22, opacity: 0 }, { scale: 1, rotation: rot, opacity: 1, duration: 0.3, ease: "back.out(2)" }, t - 0.03);
      },
      flight(id, F, t, dur) {
        const seg = dur / (F.pts.length - 1);
        tl.set(`#${id}-doodle`, { x: F.pts[0][0], y: F.pts[0][1], rotation: F.pts[0][2] }, t);
        tl.to(`#${id}-doodle`, { keyframes: F.pts.slice(1).map((p) => ({ x: p[0], y: p[1], rotation: p[2], duration: seg, ease: "none" })) }, t);
        tl.fromTo(`#${id}-trail`, { clipPath: F.clip[0] }, { clipPath: F.clip[1], duration: dur, ease: "none" }, t);
      },
      chapterIn(id, t) {
        tl.fromTo(`#${id}-icon`, { scale: 0.55, rotation: -14 }, { scale: 1, rotation: 0, duration: 0.55, ease: "back.out(2.2)" }, t + 0.04);
        tl.fromTo(`#${id}-title`, { x: 90, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power4.out" }, t + 0.06);
        tl.fromTo(`#${id}-eye`, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t + 0.12);
      },
      head(sc, t) { // eyebrow + word-by-word headline + subline of a .headblk
        tl.fromTo(`${sc} .hb-eye`, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t);
        tl.fromTo(`${sc} .hb-t span`, { y: 56, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.045 }, t + 0.06);
        if ($(`${sc} .hb-s`)) tl.fromTo(`${sc} .hb-s`, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out" }, t + 0.5);
      },
      draw(sel, t, dur) {
        $$(sel).forEach((p) => { const L = +p.dataset.len; tl.fromTo(p, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: dur, ease: "power2.out" }, t); });
      },
    };
  }

  const SC = {};

  // ================= hook (orig 0.00) =================
  SC.hook = function (tl, P) {
    const m = moves(tl);
    m.twinkle("#stars1", 0, 3.9, 11);
    tl.fromTo("#stars1", { scale: 1.08 }, { scale: 1, duration: 3.9, ease: "none" }, 0);
    tl.set(".orb1-pos", { x: 560 }, 0);
    tl.fromTo("#orb1", { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: "power3.out" }, 0);
    tl.fromTo(".orb1-tile", { scale: 0.4 }, { scale: 1, duration: 0.6, ease: "back.out(1.8)", stagger: 0.03 }, 0.02);
    m.orbitSpin("orb1", 0, 1.3, 0, 70, "none");
    m.orbitSpin("orb1", 1.3, 0.3, 70, 210, "power2.in");
    tl.to(".orb1-pos", { x: 0, duration: 0.3, ease: "power3.in" }, 1.3);
    tl.to(".orb1-tile", { scale: 0.15, opacity: 0, duration: 0.3, ease: "power2.in" }, 1.3);
    tl.fromTo("#meet", { clipPath: "inset(0% 100% 0% 0%)", rotation: -5 }, { clipPath: "inset(0% 0% 0% 0%)", rotation: 0, duration: 0.55, ease: "power2.out" }, 0.22);
    tl.to("#meet", { y: -70, opacity: 0, scale: 0.88, duration: 0.24, ease: "power2.in" }, 1.3);
    tl.fromTo("#flash1", { scale: 0.2, opacity: 0 }, { scale: 1.5, opacity: 1, duration: 0.16, ease: "power2.out" }, 1.46);
    tl.to("#flash1", { scale: 2.8, opacity: 0, duration: 0.7, ease: "power2.out" }, 1.62);
    tl.fromTo("#rg1", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power2.out" }, 1.5);
    tl.fromTo("#ring1", { scale: 0.12, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.62, ease: "back.out(1.5)" }, 1.5);
    m.sprite("#ring1", 360, 1.4, 3.95, 0);
    // beat-locked: 1.60s — wordmark slam on the bed's first strong beat
    tl.fromTo("#wm1", { scale: 1.55, opacity: 0, y: -24 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "power4.out" }, 1.58);
    tl.fromTo("#stripe1", { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out", transformOrigin: "0% 50%" }, 1.76);
    tl.fromTo("#tag1 span", { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out", stagger: 0.045 }, 1.7);
    tl.fromTo("#burst1", { scale: 0, rotation: -70 }, { scale: 1, rotation: -12, duration: 0.5, ease: "back.out(2.4)" }, 1.84);
    tl.fromTo("#burst1 svg", { rotation: 0 }, { rotation: 45, duration: 2.1, ease: "none" }, 1.85);
    tl.fromTo(".lockup1", { scale: 1 }, { scale: 1.045, duration: 2.1, ease: "none" }, 1.75);
  };

  // ================= GetGold Compare (orig 3.70) =================
  SC.compare = function (tl, P) {
    const m = moves(tl);
    m.chapterIn("ch2", 3.7);
    m.flight("ch2", P.flight, 3.7, 1.1);
    tl.to("#ch2", { scale: 7.5, opacity: 0, duration: 0.42, ease: "power3.in", transformOrigin: "455px 540px" }, 4.62);
    tl.fromTo("#ui2", { scale: 0.72 }, { scale: 1, duration: 0.7, ease: "power3.out" }, 4.72);
    tl.fromTo("#stars2", { x: 0 }, { x: -70, duration: 5.4, ease: "none" }, 3.7);
    tl.fromTo("#ghost2", { x: 40, y: 10 }, { x: -30, y: -10, duration: 4.3, ease: "sine.inOut" }, 4.7);
    tl.fromTo("#win2", { rotationY: -26, rotationX: 12, y: 90, opacity: 0, transformPerspective: 2600 }, { rotationY: -10, rotationX: 5, y: 0, opacity: 1, duration: 0.75, ease: "power3.out" }, 4.76);
    tl.to("#win2", { rotationY: -6, rotationX: 3.5, duration: 1.7, ease: "sine.inOut" }, 5.52);
    // beat-grid: cards land on the eighth-note grid (orig 5.28 / 5.54 / 5.80 / 6.07)
    P.order.forEach((k, i) => {
      tl.fromTo(`#card${k}`, { y: 150, rotationX: -40, opacity: 0, transformPerspective: 900 }, { y: 0, rotationX: 0, opacity: 1, duration: 0.5, ease: "back.out(1.5)" }, [5.28, 5.54, 5.8, 6.07][i]);
    });
    const pill = centerIn("#pillTotal", "#win2");
    tl.fromTo("#cur2", { x: 1380, y: 940, opacity: 0 }, { x: pill.x - 6, y: pill.y - 4, opacity: 1, duration: 0.62, ease: "power3.inOut" }, 6.2);
    m.click("#cur2", 6.86);
    tl.to("#pillTotal", { backgroundColor: "#E9BD50", borderColor: "#E9BD50", color: "#202722", duration: 0.14 }, 6.88);
    // re-rank by lowest final total: C, A, D, B
    P.order.forEach((k) => {
      const dx = (P.byTotal.indexOf(k) - P.order.indexOf(k)) * 374; if (!dx) return;
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
    m.slap("#stk2", 7.91, -5);
    tl.to("#stk2", { y: -10, rotation: -3, duration: 1, ease: "sine.inOut" }, 8.2);
  };

  // ================= Size guide (orig 8.96) =================
  SC.size = function (tl, P) {
    const m = moves(tl);
    m.chapterIn("ch3", 8.96);
    m.flight("ch3", P.flight, 8.96, 0.85);
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
    m.slap("#stk3", 10.3, -6);
    // beat-grid: size resolves over two beats
    tl.fromTo("#szCircle", { scale: 0.72 }, { scale: 1, duration: 0.52, ease: "power2.inOut" }, 10.54);
    tl.fromTo("#szKnob", { x: 110 }, { x: 330, duration: 0.52, ease: "power2.inOut" }, 10.54);
    tl.fromTo("#odoCol", { y: 0 }, { y: -528, duration: 0.52, ease: "power2.inOut" }, 10.54);
    tl.to("#odoCol span:not(:last-child)", { opacity: 0, duration: 0.12 }, 11.0);
    tl.fromTo(["#cv1", "#cv2", "#cv3"], { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "back.out(2)", stagger: 0.08 }, 11.06);
    const save = centerIn("#saveBtn", "#win3");
    tl.fromTo("#cur3", { x: 1500, y: 960, opacity: 0 }, { x: save.x + 40, y: save.y - 6, opacity: 1, duration: 0.6, ease: "power3.inOut" }, 10.92);
    m.click("#cur3", 11.6);
    tl.to("#saveBtn", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.18 }, 11.62);
    tl.fromTo("#saveTick", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.6)" }, 11.64);
    tl.to("#cur3", { x: save.x + 220, y: save.y + 200, opacity: 0, duration: 0.5, ease: "power2.in" }, 11.95);
  };

  // ================= Get Gold Request (orig 12.65) =================
  SC.request = function (tl, P) {
    const m = moves(tl);
    m.chapterIn("ch4", 12.65);
    m.flight("ch4", P.flight, 12.65, 0.95);
    tl.to(["#ch4-title", "#ch4-eye"], { opacity: 0, x: -40, duration: 0.2, ease: "power2.in" }, 13.24);
    tl.to("#ch4-icon", { scale: 14, duration: 0.34, ease: "power3.in" }, 13.28);
    tl.to("#ch4-icon .chg", { opacity: 0, scale: 0.6, duration: 0.14, ease: "power2.in" }, 13.26);
    tl.to("#ch4", { opacity: 0, duration: 0.2, ease: "none" }, 13.6);
    tl.fromTo("#stars4", { x: 0 }, { x: -60, duration: 5.4, ease: "none" }, 12.65);
    tl.fromTo("#win4", { y: 220, rotationX: 24, rotationY: -12, opacity: 0, transformPerspective: 2600 }, { y: 0, rotationX: 5, rotationY: -7, opacity: 1, duration: 0.55, ease: "power3.out" }, 13.5);
    tl.to("#win4", { rotationY: -4, rotationX: 3, duration: 1.8, ease: "sine.inOut" }, 14.05);
    // beat-grid: chips on three consecutive beats
    const cT = centerIn("#chipType", "#win4"), cK = centerIn("#chipK", "#win4"), cE = centerIn("#chipEm", "#win4"), sB = centerIn("#sendBtn", "#win4");
    tl.fromTo("#cur4", { x: 1300, y: 900, opacity: 0 }, { x: cT.x, y: cT.y, opacity: 1, duration: 0.42, ease: "power3.out" }, 13.3);
    m.click("#cur4", 13.7);
    tl.to("#chipType", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.14 }, 13.72);
    tl.to("#cur4", { x: cK.x, y: cK.y, duration: 0.4, ease: "power3.inOut" }, 13.8);
    m.click("#cur4", 14.22);
    tl.to("#chipK", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.14 }, 14.24);
    tl.to("#cur4", { x: cE.x, y: cE.y, duration: 0.4, ease: "power3.inOut" }, 14.32);
    m.click("#cur4", 14.76);
    tl.to("#chipEm", { backgroundColor: "#104D36", borderColor: "#104D36", color: "#FFFFFF", duration: 0.14 }, 14.78);
    tl.fromTo("#caret", { opacity: 1 }, { opacity: 0.1, duration: 0.26, ease: "steps(1)", yoyo: true, repeat: 9 }, 13.6);
    for (let i = 0; i < P.typed.n; i++) tl.set(`#tc${i}`, { display: "inline" }, +(P.typed.t0 + i * P.typed.dt).toFixed(4));
    tl.to("#cur4", { x: sB.x, y: sB.y, duration: 0.6, ease: "power3.inOut" }, 15.1);
    m.click("#cur4", 15.81);
    tl.to("#sendBtn", { scale: 0.95, backgroundColor: "#B97820", duration: 0.08, yoyo: true, repeat: 1 }, 15.79);
    tl.to("#win4", { scale: 0.84, x: -300, rotationY: 12, filter: "blur(3px)", duration: 0.55, ease: "power3.inOut" }, 15.92);
    tl.to("#cur4", { opacity: 0, duration: 0.2 }, 15.95);
    m.slap("#stk4", 16.02, -4);
    // beat-grid: offers on three consecutive beats
    [16.34, 16.86, 17.39].forEach((t, i) => tl.fromTo(`#offer${i}`, { x: 820, rotationY: -38, opacity: 0 }, { x: 0, rotationY: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t));
  };

  // ================= feature grid (orig 17.91) =================
  SC.grid = function (tl, P) {
    tl.fromTo("#grid", { rotationX: 30, rotationZ: -7, rotationY: -8, x: 90, y: 60, scale: 0.94 }, { rotationX: 18, rotationZ: -3, rotationY: -2, x: -30, y: -10, scale: 1.04, duration: P.slot, ease: "sine.inOut" }, 17.88);
    // beat-locked: tiles ripple out from the centre on the scene's downbeat
    tl.fromTo("#grid .tile", { opacity: 0, scale: 0.55, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.6)", stagger: { each: 0.05, from: "center", grid: [2, 4] } }, 17.91);
    tl.fromTo("#gh1", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 17.98);
    tl.fromTo("#gh2", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 18.44);
    tl.fromTo("#marker", { scaleX: 0 }, { scaleX: 1, duration: 0.42, ease: "power2.inOut" }, 18.96);
    tl.fromTo("#spark", { strokeDashoffset: 640 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.out" }, 18.2);
    tl.fromTo(".tile0 .tp", { color: "#0B2A22" }, { color: "#B97820", duration: 0.16, yoyo: true, repeat: 1 }, 20.2);
    tl.fromTo(".arcs", { rotation: 0 }, { rotation: 12, duration: 4, ease: "none", transformOrigin: "1730px 130px" }, 17.86);
  };

  // ================= end card (orig 21.59) =================
  SC.end = function (tl, P) {
    const m = moves(tl), T0 = 21.59, D = P.slot;
    m.twinkle("#stars6", T0, T0 + D, 61);
    tl.set(".orb6-pos", { x: 0 }, T0);
    tl.to(".orb6-pos", { x: 860, duration: 0.85, ease: "power3.out" }, 21.66);
    tl.fromTo(".orb6-tile", { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.02 }, 21.66);
    m.orbitSpin("orb6", T0, D, -40, -40 + 24 * D, "power1.out");
    tl.fromTo("#rg6", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power2.out" }, 21.85);
    tl.fromTo("#ring6", { scale: 0.1, opacity: 0, rotation: 30 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: "back.out(1.5)" }, 21.9);
    m.sprite("#ring6", 300, T0, T0 + D, 40);
    // beat-locked: end-card wordmark lands on a strong cue (orig 22.65 + version offset)
    tl.fromTo("#wm6", { scale: 1.55, opacity: 0, y: -24 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "power4.out" }, 22.63);
    tl.fromTo("#stripe6", { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out", transformOrigin: "0% 50%" }, 22.8);
    if ($("#badge6")) m.slap("#badge6", 22.95, 7);
    if ($("#endTitle")) tl.fromTo("#endTitle", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 22.9);
    if ($(".cta6")) tl.fromTo(".cta6 .ctai", { y: 40, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)", stagger: 0.26 }, 22.95);
    tl.fromTo("#ar6 span", { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power2.inOut" }, 23.25);
    if ($("#en6")) tl.fromTo("#en6", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 23.6);
    tl.fromTo(".lockup6", { scale: 1 }, { scale: 1.03, duration: Math.max(1.8, D - 1.06), ease: "none" }, 22.65);
  };

  // ================= hub: what Get Gold is (orig 0) =================
  SC.hub = function (tl, P) {
    const m = moves(tl);
    m.head("#s7", 0.1);
    tl.fromTo("#stars7", { x: 0 }, { x: -60, duration: P.slot, ease: "none" }, 0);
    tl.fromTo("#hubCore", { scale: 0.55, opacity: 0, rotationY: -30, transformPerspective: 1400 }, { scale: 1, opacity: 1, rotationY: 0, duration: 0.6, ease: "back.out(1.6)" }, 0.5);
    tl.fromTo("#hubSpark", { strokeDashoffset: 640 }, { strokeDashoffset: 0, duration: 1.3, ease: "power2.out" }, 0.8);
    tl.fromTo("#s7 .colh", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.3 }, 0.62);
    // beat-grid: left items on half-beats, then right items
    P.left.forEach((t, i) => { tl.fromTo(`#hl${i}`, { x: -90, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t); m.draw(`#hwl${i}`, t + 0.12, 0.5); });
    P.right.forEach((t, i) => { tl.fromTo(`#hr${i}`, { x: 90, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t); m.draw(`#hwr${i}`, t - 0.1, 0.45); });
    if ($("#hlNote")) tl.fromTo("#hlNote", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45 }, P.left[P.left.length - 1] + 0.3);
    tl.to("#s7 .hw-flow", { opacity: 1, duration: 0.3 }, P.flowOn);
    tl.fromTo("#s7 .hw-flow", { strokeDashoffset: 0 }, { strokeDashoffset: -54 * P.slot, duration: P.slot, ease: "none" }, 0);
    const pings = Math.max(0, Math.floor((P.slot - 1.2) / 1.045) - 1);
    tl.fromTo("#hubPing", { scale: 0.6, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 1.045, ease: "power2.out", repeat: pings }, 1.04);
    m.slap("#stk7", P.sticker, -4);
  };

  // ================= lanes: how it works (orig 0) =================
  SC.lanes = function (tl, P) {
    const m = moves(tl);
    m.head("#s8", 0.1);
    tl.fromTo("#s8 .ln-track", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.inOut", transformOrigin: "0% 50%" }, 0.25);
    if ($("#s8 .ln-lane")) tl.fromTo("#s8 .ln-lane", { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, stagger: 0.12 }, 0.3);
    tl.set("#s8 .ln-fill", { scaleX: 0 }, 0);
    const tok = $("#lnToken");
    tl.set(tok, { x: P.nodes[0].x - 17, y: P.nodes[0].y - 17, opacity: 0 }, 0);
    tl.to(tok, { opacity: 1, duration: 0.2 }, P.nodes[0].t - 0.1);
    // beat-grid: each step lights on its own beat, the token travels between them
    P.nodes.forEach((n, i) => {
      tl.fromTo(`#lnN${i}`, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: "back.out(2.2)" }, n.t - 0.12);
      tl.to(`#lnN${i}`, { backgroundColor: n.lane ? "#17654F" : "#104D36", color: "#F3D88A", borderColor: "#E9BD50", duration: 0.2 }, n.t);
      tl.fromTo(`#lnL${i}`, { y: n.above ? -18 : 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, n.t - 0.04);
      if ($(`#lnU${i}`)) tl.fromTo(`#lnU${i}`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, n.t - 0.1);
      if (i > 0) tl.to(tok, { x: n.x - 17, y: n.y - 17, duration: Math.min(0.42, n.t - P.nodes[i - 1].t - 0.04), ease: "power2.inOut" }, n.t - Math.min(0.42, n.t - P.nodes[i - 1].t - 0.04));
      if (n.fill) tl.to(`#lnF${n.lane}`, { scaleX: n.fill, duration: 0.42, ease: "power2.inOut" }, n.t - 0.42);
      if (n.vert) tl.fromTo(`#lnV${n.vert}`, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: "power2.out" }, n.t - 0.34);
    });
    tl.to(tok, { scale: 1.5, duration: 0.25, yoyo: true, repeat: 1, ease: "power2.out" }, P.nodes[P.nodes.length - 1].t);
  };

  // ================= split: buyer request meets jeweller offer (orig 0) =================
  SC.split = function (tl, P) {
    const m = moves(tl);
    tl.fromTo("#stars9", { x: 0 }, { x: -50, duration: P.slot, ease: "none" }, 0);
    tl.fromTo("#spB", { rotationY: 16, x: -60, opacity: 0, transformPerspective: 2400 }, { rotationY: 9, x: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.04);
    tl.fromTo("#spJ", { rotationY: -16, x: 60, opacity: 0, transformPerspective: 2400 }, { rotationY: -9, x: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.12);
    tl.fromTo("#s9 .sp-tag", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(2)", stagger: 0.1 }, 0.1);
    for (let i = 0; i < P.typed.n; i++) tl.set(`#tq${i}`, { display: "inline" }, +(P.typed.t0 + i * P.typed.dt).toFixed(4));
    const sb = centerIn("#spSend", "#spB");
    tl.fromTo("#cur9a", { x: 700, y: 760, opacity: 0 }, { x: sb.x, y: sb.y, opacity: 1, duration: 0.5, ease: "power3.inOut" }, 0.62);
    m.click("#cur9a", P.send);
    tl.to("#spSend", { scale: 0.95, backgroundColor: "#B97820", duration: 0.08, yoyo: true, repeat: 1 }, P.send - 0.02);
    tl.to("#cur9a", { opacity: 0, duration: 0.2 }, P.send + 0.2);
    // request card flies across to the jeweller
    tl.fromTo("#flyReq", { x: P.fly.a[0], y: P.fly.a[1], rotation: -8, scale: 0.9, opacity: 0 }, { keyframes: [{ opacity: 1, duration: 0.08 }, { x: (P.fly.a[0] + P.fly.b[0]) / 2, y: P.fly.a[1] - 170, rotation: 6, scale: 1.05, duration: 0.28, ease: "power2.out" }, { x: P.fly.b[0], y: P.fly.b[1], rotation: 0, scale: 1, duration: 0.26, ease: "power2.in" }, { opacity: 0, duration: 0.08 }] }, P.send + 0.08);
    tl.to("#spEmpty", { opacity: 0, duration: 0.15 }, P.land - 0.1);
    tl.fromTo("#spReq", { y: -30, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P.land);
    tl.fromTo("#spForm", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, P.form);
    // beat-grid: the three offer fields fill on consecutive half-beats
    P.fields.forEach((t, i) => tl.fromTo(`#spV${i} b`, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.2 }, t));
    const so = centerIn("#spOfferBtn", "#spJ");
    tl.fromTo("#cur9b", { x: 700, y: 760, opacity: 0 }, { x: so.x, y: so.y, opacity: 1, duration: 0.5, ease: "power3.inOut" }, P.fields[0]);
    m.click("#cur9b", P.offer);
    tl.to("#spOfferBtn", { scale: 0.95, backgroundColor: "#104D36", color: "#FFFFFF", duration: 0.1 }, P.offer);
    tl.fromTo("#spSent", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.6)" }, P.offer + 0.04);
    tl.to("#cur9b", { opacity: 0, duration: 0.2 }, P.offer + 0.25);
    // the offer flies back to the buyer
    tl.fromTo("#flyOffer", { x: P.fly.c[0], y: P.fly.c[1], rotation: 8, scale: 0.9, opacity: 0 }, { keyframes: [{ opacity: 1, duration: 0.08 }, { x: (P.fly.c[0] + P.fly.d[0]) / 2, y: P.fly.c[1] - 200, rotation: -6, scale: 1.05, duration: 0.28, ease: "power2.out" }, { x: P.fly.d[0], y: P.fly.d[1], rotation: 0, scale: 1, duration: 0.26, ease: "power2.in" }, { opacity: 0, duration: 0.08 }] }, P.offer + 0.12);
    tl.fromTo("#spOffer", { y: 30, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P.back);
    tl.fromTo("#spAccept", { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, ease: "sine.inOut" }, P.back + 0.5);
    m.slap("#stk9", P.sticker, -4);
  };

  // ================= pieces: quick capture + spreadsheet (orig 0) =================
  SC.pieces = function (tl, P) {
    const m = moves(tl);
    m.head("#s10", 0.1);
    tl.fromTo("#stars10", { x: 0 }, { x: 60, duration: P.slot, ease: "none" }, 0);
    tl.fromTo("#pcFrame", { scale: 0.86, rotation: -4, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.55, ease: "back.out(1.6)" }, 0.2);
    tl.fromTo("#pcChip", { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, 0.45);
    tl.fromTo("#pcScan", { y: 0, opacity: 0 }, { keyframes: [{ opacity: 1, duration: 0.06 }, { y: 574, duration: 0.8, ease: "none" }, { opacity: 0, duration: 0.1 }] }, P.scan);
    // beat-grid: detected pieces on half-beats
    P.boxes.forEach((t, i) => {
      tl.fromTo(`#pcB${i}`, { scale: 1.35, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }, t);
    });
    P.fly.forEach((f, i) => {
      tl.fromTo(`#pcD${i}`, { x: f.dx, y: f.dy, scale: f.s, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.55, ease: "power3.inOut" }, P.drafts + i * 0.08);
    });
    tl.to("#s10 .pc-box", { opacity: 0.35, duration: 0.3 }, P.drafts + 0.3);
    tl.fromTo("#pcSheet", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, P.sheet);
    P.rows.forEach((t, i) => {
      tl.fromTo(`#pcR${i}`, { x: 120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, t);
      tl.fromTo(`#pcR${i} .pc-ok`, { scale: 0 }, { scale: 1, duration: 0.25, ease: "back.out(3)" }, t + 0.2);
    });
    m.slap("#stk10", P.sticker, -3);
  };

  // ================= founding offer (orig 0) =================
  SC.founding = function (tl, P) {
    const m = moves(tl);
    tl.fromTo("#s11 .fd-glow", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "power2.out" }, 0);
    m.head("#s11", 0.08);
    // beat-locked: the seal stamps down on the scene's first beat
    tl.fromTo("#fdSeal", { scale: 2.2, rotation: -40, opacity: 0 }, { scale: 1, rotation: -8, opacity: 1, duration: 0.36, ease: "back.out(1.8)" }, P.seal - 0.06);
    tl.fromTo("#fdSeal svg", { rotation: 0 }, { rotation: 30, duration: P.slot, ease: "none" }, 0);
    P.rows.forEach((t, i) => {
      tl.fromTo(`#fdR${i}`, { x: 70, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, t - 0.06);
      tl.fromTo(`#fdR${i} .fd-ck`, { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.35, ease: "back.out(2.6)" }, t);
    });
    tl.fromTo("#fdKeep", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, P.keep);
    m.slap("#stk11", P.sticker, -4);
  };

  // ---------- master: transitions between scenes ----------
  function transitions(M) {
    const T = {
      whip(prev, s) {
        const t = s.start, out = `#${prev.id}in`, inn = `#${s.id}in`, fid = s.fid;
        M.set(out, { filter: `url(#${fid})` }, t - 0.12);
        M.fromTo(out, { x: 0 }, { x: -1530, duration: 0.22, ease: "power3.in", immediateRender: false }, t - 0.12);
        M.set(inn, { filter: `url(#${fid})` }, t - 0.02);
        M.fromTo(inn, { x: 1700 }, { x: 0, duration: 0.36, ease: "expo.out" }, t - 0.02);
        M.fromTo(`#${fid}g`, { attr: { stdDeviation: "0 0" } }, { attr: { stdDeviation: "120 0" }, duration: 0.12, ease: "power2.in" }, t - 0.1);
        M.to(`#${fid}g`, { attr: { stdDeviation: "0 0" }, duration: 0.28, ease: "power2.out" }, t + 0.02);
        M.set(inn, { filter: "none" }, t + 0.32);
      },
      zoomfade(prev, s) {
        const t = s.start;
        M.to(`#${prev.id}in`, { scale: 0.82, opacity: 0, duration: 0.3, ease: "power2.in" }, t - 0.09);
        M.fromTo(`#${s.id}in`, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.36, ease: "power3.out" }, t - 0.05);
      },
      iris(prev, s) {
        const t = s.start;
        M.to(`#${prev.id}in`, { scale: 0.9, duration: 0.5, ease: "power2.in" }, t - 0.04);
        M.fromTo(`#${s.id}in`, { clipPath: "circle(0% at 50% 52%)" }, { clipPath: "circle(75% at 50% 52%)", duration: 0.5, ease: "power3.inOut" }, t);
        // gold rim riding the iris edge: circle(p%) radius = p% of sqrt(w²+h²)/√2 ≈ 1557px
        M.fromTo("#irisRing", { width: 0, height: 0, opacity: 1 }, { width: 2336, height: 2336, duration: 0.5, ease: "power3.inOut" }, t);
        M.to("#irisRing", { opacity: 0, duration: 0.2, ease: "none" }, t + 0.36);
      },
    };
    CFG.scenes.forEach((s, i) => { if (i) T[s.trans](CFG.scenes[i - 1], s); });
  }

  function build() {
    const M = gsap.timeline({ paused: true });
    const root = $("#root");
    // audio-reactive layer: pre-extracted bass/treble of this cut's music, one sample per frame
    let sb = CFG.audio.bass[0], st = CFG.audio.treble[0];
    for (let f = 0; f < CFG.audio.bass.length; f++) {
      sb = sb * 0.55 + CFG.audio.bass[f] * 0.45; st = st * 0.55 + CFG.audio.treble[f] * 0.45;
      M.set(root, { "--bass": +sb.toFixed(3), "--treb": +st.toFixed(3) }, +(f / 30).toFixed(4));
    }
    // Each scene is authored in its own time base (orig) and placed at this cut's start.
    CFG.scenes.forEach((s) => { const c = gsap.timeline(); SC[s.key](c, s); M.add(c, +(s.start - s.orig).toFixed(4)); });
    transitions(M);
    window.__timelines["main"] = M;
  }

  document.fonts.ready.then(build);
})();
