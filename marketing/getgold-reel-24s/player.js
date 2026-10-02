/*
 * GetGold.ae reel: preview player.
 *
 * Controls live outside the ad frame. The clock follows the AudioContext while
 * playing, so picture and sound stay locked; frames come from REEL.renderAt(t),
 * the same function the exporter samples at t = frame / 30.
 */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const REEL = window.REEL;
  const DUR = REEL.DURATION;
  const FPS = REEL.FPS;
  const isRender = /[?&]render\b/.test(location.search);
  if (isRender) document.documentElement.classList.add("render");

  const frame = $("#frame");
  const stage = $("#stage");

  function fit() {
    const s = isRender ? 1 : frame.clientWidth / REEL.W;
    stage.style.transform = `scale(${s})`;
  }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(frame);
  window.addEventListener("resize", fit);
  fit();

  /* ---------- playback state ---------- */

  let t = 0;
  let playing = false;
  let muted = false;
  let ac = null;
  let gain = null;
  let src = null;
  let startAt = 0;

  const now = () => (ac ? ac.currentTime : performance.now() / 1000);

  function ensureAudio() {
    if (ac) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      gain = ac.createGain();
      gain.gain.value = muted ? 0 : 1;
      gain.connect(ac.destination);
    } catch (e) {
      ac = null;
    }
  }

  function startSource(offset) {
    stopSource();
    if (!ac || !REEL.audio.buffer || offset >= DUR) return;
    src = ac.createBufferSource();
    src.buffer = REEL.audio.buffer;
    src.connect(gain);
    src.start(0, offset);
  }

  function stopSource() {
    if (src) {
      try {
        src.stop();
      } catch (e) {
        /* already stopped */
      }
      src.disconnect();
      src = null;
    }
  }

  function play() {
    if (t >= DUR - 1 / FPS) t = 0;
    ensureAudio();
    if (ac && ac.state === "suspended") ac.resume();
    startSource(t);
    startAt = now() - t;
    playing = true;
    requestAnimationFrame(tick);
    sync();
  }

  function pause() {
    if (playing) t = Math.min(DUR, now() - startAt);
    playing = false;
    stopSource();
    REEL.renderAt(t);
    sync();
  }

  function seek(sec) {
    t = Math.max(0, Math.min(DUR, sec));
    if (playing) {
      startSource(t);
      startAt = now() - t;
    }
    REEL.renderAt(t);
    sync();
  }

  function tick() {
    if (!playing) return;
    t = now() - startAt;
    if (t >= DUR) {
      // End on the final frame; no loop, no fade.
      t = DUR;
      playing = false;
      stopSource();
    }
    REEL.renderAt(t);
    sync();
    if (playing) requestAnimationFrame(tick);
  }

  /* ---------- UI ---------- */

  const playBtn = $("#play");
  const replayBtn = $("#replay");
  const muteBtn = $("#mute");
  const scrub = $("#scrub");
  const tNow = $("#tNow");
  let sceneButtons = [];

  function sync() {
    $("#playLabel").textContent = playing ? "Pause" : "Play";
    $("#playIcon").innerHTML = playing
      ? '<path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/>'
      : '<path d="M4 2.5v11l9-5.5z"/>';
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    const f = Math.min(REEL.FRAMES, Math.round(t * FPS));
    if (document.activeElement !== scrub || playing) scrub.value = String(f);
    scrub.setAttribute("aria-valuetext", `${t.toFixed(2)} seconds`);
    tNow.textContent = t.toFixed(2).padStart(5, "0");
    const idx = REEL.SCENES.findIndex((s) => t >= s.start && (t < s.end || s.id === 5));
    sceneButtons.forEach((b, i) => b.classList.toggle("active", i === idx));
  }

  function setMuted(m) {
    muted = m;
    if (gain && ac) gain.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.015);
    muteBtn.setAttribute("aria-pressed", String(muted));
    $("#muteLabel").textContent = muted ? "Unmute" : "Mute";
    $("#muteIcon").innerHTML = muted
      ? '<path d="M2 6h3l4-3.5v11L5 10H2z"/><path d="M10.6 5.6l1-1L13 6l1.4-1.4 1 1L14 7l1.4 1.4-1 1L13 8l-1.4 1.4-1-1L12 7z"/>'
      : '<path d="M2 6h3l4-3.5v11L5 10H2z"/><path d="M11 5.2a4 4 0 0 1 0 5.6l1 1a5.4 5.4 0 0 0 0-7.6z"/>';
  }

  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  replayBtn.addEventListener("click", () => {
    t = 0;
    play();
  });
  muteBtn.addEventListener("click", () => setMuted(!muted));
  scrub.addEventListener("input", () => seek(Number(scrub.value) / FPS));
  $("#guides").addEventListener("change", (e) => {
    $("#safe").hidden = !e.target.checked;
  });

  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag) || playBtn.disabled) return;
    if (e.code === "Space") {
      e.preventDefault();
      playing ? pause() : play();
    } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
      e.preventDefault();
      if (playing) pause();
      seek(Math.round(t * FPS + (e.code === "ArrowRight" ? 1 : -1)) / FPS);
    }
  });

  // Scene ticks under the scrubber and the scene list.
  const ticks = $("#ticks");
  REEL.SCENES.forEach((s) => {
    if (s.start > 0) {
      const mark = document.createElement("span");
      mark.style.left = (s.start / DUR) * 100 + "%";
      ticks.appendChild(mark);
    }
    const label = document.createElement("em");
    label.textContent = String(s.id);
    label.style.left = (((s.start + s.end) / 2) / DUR) * 100 + "%";
    ticks.appendChild(label);
  });

  const COPY = {
    1: "“Your next gold piece?”",
    2: "“Discover your style.”",
    3: "“UAE jewellers. One marketplace.”",
    4: "“Explore the collection.” then “Find your next piece.”",
    5: "Logo, “getgold.ae”, “Explore now”, held to 24.0 s",
  };
  const list = $("#scenes");
  sceneButtons = REEL.SCENES.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "scene";
    b.innerHTML = `<span class="when">${s.start.toFixed(1)}–${s.end.toFixed(1)} s</span><span><span class="what">${s.id}. ${s.name}</span><br><span class="copy"></span></span>`;
    b.querySelector(".copy").textContent = COPY[s.id];
    b.addEventListener("click", () => {
      if (playing) pause();
      seek(s.start);
    });
    list.appendChild(b);
    return b;
  });

  /* ---------- assets and status ---------- */

  const preview = {};

  function pill(id, cls, text) {
    const el = $(id);
    el.className = "pill " + cls;
    el.textContent = text;
  }

  function refreshStatus() {
    const slots = REEL.state.slots;
    const label = (k, inConfig) =>
      preview[k] ? ["info", "Preview file"] : slots[k] ? ["ok", inConfig ? "In use" : "In use"] : ["warn", "Missing"];
    pill("#st-ring", ...label("ring", true));
    pill("#st-screenshot", ...label("screenshot", true));
    if (slots.logo || preview.logo) pill("#st-logo", ...label("logo", true));
    else pill("#st-logo", "warn", "Interim wordmark");
    $("#logoNote").textContent = slots.logo
      ? "Shown top-left from frame one and in the end lockup."
      : "Until the official file arrives, the reel sets “GET GOLD” in a serif as the website header does. Shown top-left from frame one and in the end lockup.";

    const missing = [];
    if (!slots.ring) missing.push("ring photo");
    if (!slots.screenshot) missing.push("marketplace screenshot");
    const status = $("#status");
    if (missing.length || !slots.logo) {
      status.className = "status";
      const parts = [];
      if (missing.length) parts.push(`the ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing and shown as labelled placeholders`);
      if (!slots.logo) parts.push("the logo is an interim wordmark");
      const sentence = parts.join("; ");
      status.innerHTML = `<strong>Draft, not the finished ad.</strong> ${sentence.charAt(0).toUpperCase() + sentence.slice(1)}.`;
    } else {
      status.className = "status ok";
      status.innerHTML = "<strong>All visual assets in place.</strong> Timing, copy and layout are final.";
    }
    const w = REEL.state.warnings;
    const box = $("#warnings");
    box.hidden = !w.length;
    box.textContent = w.join(" · ");

    const a = REEL.audio;
    pill("#st-music", a.music ? "info" : "ok", a.music ? "Preview file" : "Generated instrumental");
    pill("#st-vo", a.voiceover ? "info" : "warn", a.voiceover ? "Preview file" : "Not included");
  }

  function wireImage(id, key) {
    $(id).addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await REEL.setSlotImage(key, URL.createObjectURL(file));
        preview[key] = true;
      } catch (err) {
        REEL.state.warnings.push(`${file.name}: ${err.message}`);
      }
      refreshStatus();
    });
  }
  wireImage("#up-ring", "ring");
  wireImage("#up-screenshot", "screenshot");
  wireImage("#up-logo", "logo");

  async function afterAudioChange() {
    if (playing) {
      startSource(t);
      startAt = now() - t;
    }
    refreshStatus();
  }

  function wireAudio(id, key) {
    $(id).addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await REEL.setAudio(key, await file.arrayBuffer());
      } catch (err) {
        REEL.state.warnings.push(`${file.name}: this browser could not decode the audio.`);
      }
      await afterAudioChange();
    });
  }
  wireAudio("#up-music", "music");
  wireAudio("#up-vo", "voiceover");
  $("#voStart").value = String(REEL.audio.voiceoverStart);
  $("#voStart").addEventListener("change", async (e) => {
    const v = Math.max(0, Math.min(20, Number(e.target.value) || 0));
    e.target.value = v.toFixed(1);
    await REEL.setVoiceoverStart(v);
    await afterAudioChange();
  });

  /* ---------- boot ---------- */

  REEL.init(stage)
    .then(() => {
      fit();
      REEL.renderAt(0);
      [playBtn, replayBtn, muteBtn, scrub].forEach((b) => (b.disabled = false));
      sync();
      refreshStatus();
      window.__reelReady = true;
    })
    .catch((err) => {
      $("#status").textContent = "Could not load the reel: " + err.message;
      window.__reelError = String(err && err.stack ? err.stack : err);
    });
})();
