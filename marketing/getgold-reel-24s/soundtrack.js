/*
 * GetGold.ae reel: soundtrack.
 *
 * Renders one continuous 24-second instrumental with the Web Audio API in an
 * OfflineAudioContext: warm pads, a soft electric pluck, sub bass and light
 * percussion at 120 BPM (one bar = 2.0 s, so every scene cut lands on a beat),
 * plus three restrained transition cues. Noise comes from a seeded generator,
 * so every render is identical. The preview and the MP4 export both play the
 * buffer this file produces.
 *
 * Optional user audio: a music file replaces the generated instrumental, and a
 * voiceover file is laid on top with the music dipped underneath it.
 */
(function () {
  "use strict";

  const SR = 48000;
  const DURATION = 24;
  const BEAT = 0.5; // 120 BPM
  const BAR = BEAT * 4;

  // Fmaj9 | Dm9 | Bbmaj9 | C | Fmaj9 | Bb6/F | Fmaj9. Pads move by step.
  const CHORDS = [
    { t: 0, bass: 41, pad: [57, 60, 64, 67] },
    { t: 4, bass: 38, pad: [57, 60, 64, 65] },
    { t: 8, bass: 34, pad: [57, 60, 62, 65] },
    { t: 12, bass: 36, pad: [55, 60, 64, 67] },
    { t: 16, bass: 41, pad: [57, 60, 64, 67] },
    { t: 20, bass: 41, pad: [58, 62, 65, 67] },
    { t: 22, bass: 41, pad: [57, 60, 64, 67] },
  ];
  const CHORD_END = DURATION + 0.5;

  // Transition cues, matched to the picture.
  const CUES = [
    { t: 7.0, kind: "swell", label: "Phone enters (scene 3)" },
    { t: 12.0, kind: "swell", label: "Collection slides in (scene 4)" },
    { t: 17.9, kind: "chime", label: "Logo settles (scene 5)" },
  ];

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noiseBuffer(ctx, seconds, seed) {
    const len = Math.round(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(seed);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  function impulse(ctx, seconds, decay, seed) {
    const len = Math.round(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const r = rng(seed + c * 7919);
      for (let i = 0; i < len; i++) {
        d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function chordAt(t) {
    let c = CHORDS[0];
    for (const ch of CHORDS) if (ch.t <= t + 1e-6) c = ch;
    return c;
  }

  /* ---------- instruments ---------- */

  function pad(ctx, bus, t0, t1, notes, first) {
    const attack = first ? 0.35 : 0.9;
    const release = 1.4;
    const level = 0.042;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 0.5;
    filt.frequency.setValueAtTime(820, t0);
    filt.frequency.linearRampToValueAtTime(1350, Math.min(t1, DURATION));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + attack);
    g.gain.setValueAtTime(level, t1);
    g.gain.linearRampToValueAtTime(0, t1 + release);
    filt.connect(g);
    g.connect(bus.dry);
    g.connect(bus.verb);
    notes.forEach((n, i) => {
      [-7, 7].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midi(n);
        o.detune.value = det + (i - 1.5) * 1.5;
        const p = ctx.createStereoPanner();
        p.pan.value = (det < 0 ? -0.42 : 0.42) * (0.6 + i * 0.13);
        o.connect(p).connect(filt);
        o.start(t0);
        o.stop(t1 + release + 0.05);
      });
    });
  }

  function bass(ctx, bus, t0, t1, note) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.055, t0 + 0.06);
    g.gain.setValueAtTime(0.055, t1 - 0.05);
    g.gain.linearRampToValueAtTime(0, t1 + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240;
    lp.connect(g).connect(bus.dry);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = midi(note);
    o.connect(lp);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = midi(note + 12);
    const g2 = ctx.createGain();
    g2.gain.value = 0.45;
    o2.connect(g2).connect(lp);
    [o, o2].forEach((x) => {
      x.start(t0);
      x.stop(t1 + 0.6);
    });
  }

  function pluck(ctx, bus, t, note, vel, bright) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.62);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = bright;
    lp.Q.value = 0.4;
    lp.connect(g);
    g.connect(bus.dry);
    g.connect(bus.delay);
    g.connect(bus.verb);
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = midi(note);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = midi(note + 12);
    o2.detune.value = 4;
    const g2 = ctx.createGain();
    g2.gain.value = 0.32;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    [o1, o2].forEach((x) => {
      x.start(t);
      x.stop(t + 0.66);
    });
  }

  function kick(ctx, bus, t, vel) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(105, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    o.connect(g).connect(bus.dry);
    o.start(t);
    o.stop(t + 0.45);
  }

  function snap(ctx, bus, noise, t, vel) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.16);
    s.connect(bp).connect(g);
    g.connect(bus.dry);
    g.connect(bus.verb);
    s.start(t, (t * 0.37) % 1);
    s.stop(t + 0.18);
  }

  function shaker(ctx, bus, noise, t, vel, pan) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.075);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(hp).connect(g).connect(p).connect(bus.dry);
    s.start(t, (t * 0.53) % 1);
    s.stop(t + 0.09);
  }

  function swell(ctx, bus, noise, tPeak) {
    const t0 = tPeak - 0.6;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(320, t0);
    bp.frequency.exponentialRampToValueAtTime(2600, tPeak);
    bp.frequency.exponentialRampToValueAtTime(900, tPeak + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.085, tPeak - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0005, tPeak + 0.42);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.45, t0);
    p.pan.linearRampToValueAtTime(0.45, tPeak + 0.4);
    s.connect(bp).connect(g).connect(p);
    p.connect(bus.dry);
    p.connect(bus.verb);
    s.start(t0, 2.0);
    s.stop(tPeak + 0.45);
  }

  function chime(ctx, bus, t) {
    const base = midi(77); // F5
    const partials = [
      [1, 1, 2.6],
      [2, 0.32, 1.5],
      [2.76, 0.2, 1.0],
      [5.4, 0.06, 0.45],
    ];
    partials.forEach(([ratio, amp, tau]) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 * amp, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.004, tau / 3);
      o.connect(g);
      g.connect(bus.dry);
      g.connect(bus.verb);
      o.start(t);
      o.stop(Math.min(t + tau * 2.2, DURATION));
    });
  }

  /* ---------- arrangement ---------- */

  function buildMusic(ctx, bus) {
    const noise = noiseBuffer(ctx, 4, 20261002);

    CHORDS.forEach((c, i) => {
      const t1 = i + 1 < CHORDS.length ? CHORDS[i + 1].t : CHORD_END;
      pad(ctx, bus, c.t, t1, c.pad, i === 0);
      // Bass enters with the first beat of scene 2.
      const b0 = Math.max(c.t, 3.0);
      if (b0 < t1) bass(ctx, bus, b0, Math.min(t1, DURATION + 0.2), c.bass);
    });

    // Pluck arpeggio in eighths from frame one; a little brighter from scene 3.
    const PATTERN = [0, 2, 1, 3, 2, 0, 3, 1];
    for (let step = 0; step * 0.25 < 22.0 - 1e-6; step++) {
      const t = step * 0.25;
      const c = chordAt(t);
      const tones = c.pad.map((n) => n + 12);
      const note = tones[PATTERN[step % 8]];
      const onBeat = step % 2 === 0;
      const intro = t < 3.0 ? 0.8 : 1;
      const vel = (onBeat ? 0.09 : 0.062) * intro;
      const bright = t < 7 ? 2300 : 3200;
      pluck(ctx, bus, t, note, vel, bright);
    }
    // Final sustained tonic as the end card holds.
    pluck(ctx, bus, 22.0, 77, 0.07, 2600);

    // Percussion: enters on the scene-2 cut, steps out at 22.0.
    kick(ctx, bus, 3.0, 0.22);
    for (let bar = 4; bar < 22; bar += BAR) {
      kick(ctx, bus, bar, 0.24);
      kick(ctx, bus, bar + 1.25, 0.15);
      snap(ctx, bus, noise, bar + 1.0, 0.22);
    }
    kick(ctx, bus, 22.0, 0.22);
    for (let t = 7.0; t < 22.0 - 1e-6; t += 0.25) {
      const off = Math.round(t / 0.25) % 2 === 1;
      shaker(ctx, bus, noise, t, off ? 0.07 : 0.04, off ? 0.25 : -0.2);
    }
  }

  function buildCues(ctx, bus) {
    const noise = noiseBuffer(ctx, 4, 7);
    CUES.forEach((c) => {
      if (c.kind === "swell") swell(ctx, bus, noise, c.t);
      else chime(ctx, bus, c.t);
    });
  }

  function makeBus(ctx, out, { reverb, delay }) {
    const dry = ctx.createGain();
    dry.connect(out);
    const verbIn = ctx.createGain();
    verbIn.gain.value = reverb;
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.6, 3.2, 99);
    const verbLp = ctx.createBiquadFilter();
    verbLp.type = "lowpass";
    verbLp.frequency.value = 5200;
    verbIn.connect(conv).connect(verbLp).connect(out);
    const delayIn = ctx.createGain();
    delayIn.gain.value = delay;
    const d = ctx.createDelay(1.0);
    d.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 2200;
    delayIn.connect(d);
    d.connect(dlp).connect(fb).connect(d);
    dlp.connect(out);
    return { dry, verb: verbIn, delay: delayIn };
  }

  /* ---------- public API ---------- */

  async function decode(arrayBuffer) {
    const ctx = new OfflineAudioContext(2, SR, SR);
    return await ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Render the full 24-second mix.
   * opts.music: AudioBuffer replacing the generated instrumental (optional)
   * opts.voiceover: AudioBuffer (optional); opts.voiceoverStart: seconds
   */
  async function render(opts = {}) {
    const ctx = new OfflineAudioContext(2, SR * DURATION, SR);

    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.25;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(1, 0);
    fade.gain.setValueAtTime(1, DURATION - 1.4);
    fade.gain.linearRampToValueAtTime(0, DURATION);
    master.connect(comp).connect(fade).connect(ctx.destination);

    // Music and cues share a bus so both dip under a voiceover.
    const musicBus = ctx.createGain();
    musicBus.connect(master);

    if (opts.music) {
      const s = ctx.createBufferSource();
      s.buffer = opts.music;
      s.connect(musicBus);
      s.start(0);
    } else {
      buildMusic(ctx, makeBus(ctx, musicBus, { reverb: 0.32, delay: 0.2 }));
    }
    buildCues(ctx, makeBus(ctx, musicBus, { reverb: 0.4, delay: 0 }));

    let vo = null;
    if (opts.voiceover) {
      const start = Math.max(0, Number(opts.voiceoverStart) || 0);
      const end = Math.min(DURATION, start + opts.voiceover.duration);
      const s = ctx.createBufferSource();
      s.buffer = opts.voiceover;
      const g = ctx.createGain();
      g.gain.value = 1.0;
      s.connect(g).connect(master);
      s.start(start);
      const duck = musicBus.gain;
      duck.setValueAtTime(1, Math.max(0, start - 0.25));
      duck.linearRampToValueAtTime(0.5, start);
      duck.setValueAtTime(0.5, end);
      duck.linearRampToValueAtTime(1, Math.min(DURATION, end + 0.4));
      vo = { start, end };
    }

    const buffer = await ctx.startRendering();

    // Loudness: the ungated K-weighted mean reads about 1 dB under a gated
    // BS.1770 meter, so aiming at -13 here lands near -14 LUFS integrated.
    // Peaks stay at or below -1 dBFS.
    const lufs = await loudness(buffer);
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
      }
    }
    if (peak > 0) {
      const gain = Math.min(Math.pow(10, (-13 - lufs) / 20), 0.891 / peak);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= gain;
      }
    }
    return { buffer, peak, lufsBefore: lufs, voiceover: vo, generatedMusic: !opts.music };
  }

  // Ungated integrated loudness with the BS.1770 K-weighting filters.
  async function loudness(buffer) {
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 1681;
    shelf.gain.value = 4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 38;
    hp.Q.value = 0.5;
    s.connect(shelf).connect(hp).connect(ctx.destination);
    s.start(0);
    const k = await ctx.startRendering();
    let sum = 0;
    for (let c = 0; c < k.numberOfChannels; c++) {
      const d = k.getChannelData(c);
      let ms = 0;
      for (let i = 0; i < d.length; i++) ms += d[i] * d[i];
      sum += ms / d.length;
    }
    return sum > 0 ? -0.691 + 10 * Math.log10(sum) : -70;
  }

  function toWav(buffer) {
    const ch = buffer.numberOfChannels;
    const len = buffer.length;
    const bytes = 44 + len * ch * 2;
    const ab = new ArrayBuffer(bytes);
    const v = new DataView(ab);
    const str = (o, s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, "RIFF");
    v.setUint32(4, bytes - 8, true);
    str(8, "WAVE");
    str(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, ch, true);
    v.setUint32(24, buffer.sampleRate, true);
    v.setUint32(28, buffer.sampleRate * ch * 2, true);
    v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, len * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, data[c][i]));
        v.setInt16(o, Math.round(s * 32767), true);
        o += 2;
      }
    }
    return ab;
  }

  window.ReelSoundtrack = { SAMPLE_RATE: SR, DURATION, CUES, decode, render, toWav };
})();
