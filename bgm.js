// Light background music, composed live with Web Audio (no audio files).
// createBGM(ctx, destination, style) -> { start(), stop(), setLevel(v) }
//   style 'tuk': a relaxed Egyptian street groove (hijaz melody on a plucked oud-like voice, darbuka, soft bass)
//   style 'war': calm cinematic tension (low pad, slow ostinato, soft distant drums)

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function createBGM(ctx, dest, style) {
  const out = ctx.createGain();
  out.gain.value = 0;
  // a little room so the music sits behind the game
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = style === 'war' ? 3800 : 6000;
  out.connect(tone); tone.connect(dest); tone.connect(conv); conv.connect(wet); wet.connect(dest);
  let noise = null;
  { const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b; }

  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  function pluck(f, t, vol, dec = 0.5) { // oud / qanun-like
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.003;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + dec);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(lp); o.connect(lp); lp.connect(g); g.connect(out);
    env(g, t, 0.004, vol, dec); o.start(t); o2.start(t); o.stop(t + dec + 0.05); o2.stop(t + dec + 0.05);
  }
  function pad(fs, t, dur, vol) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4; lp.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const f of fs) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }
  }
  function bass(f, t, dur, vol) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(out); env(g, t, 0.01, vol, dur); o.start(t); o.stop(t + dur + 0.05); }
  function drum(kind, t, vol) { // darbuka doum / tak, or a soft low war drum
    if (kind === 'doum' || kind === 'taiko') {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      const f0 = kind === 'taiko' ? 110 : 150, f1 = kind === 'taiko' ? 42 : 70, d = kind === 'taiko' ? 0.9 : 0.35;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6); o.connect(g); g.connect(out); env(g, t, 0.003, vol, d); o.start(t); o.stop(t + d + 0.05);
    }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise;
    f.type = 'bandpass'; f.frequency.value = kind === 'tak' ? 3200 : kind === 'ka' ? 2200 : 900; f.Q.value = kind === 'tak' ? 2.5 : 1;
    s.connect(f); f.connect(g); g.connect(out); env(g, t, 0.002, vol * (kind === 'doum' || kind === 'taiko' ? 0.25 : 0.7), kind === 'tak' ? 0.07 : 0.12); s.start(t, Math.random() * 0.5); s.stop(t + 0.3);
  }

  // ---- the two styles ----
  const TUK = { bpm: 104, // maqam hijaz on D: D Eb F# G A Bb C D
    scale: [62, 63, 66, 67, 69, 70, 72, 74, 75, 78, 79, 81],
    rhythm: ['doum', null, 'tak', null, 'tak', null, 'doum', null, 'doum', null, 'tak', null, 'tak', 'ka', 'tak', null], // maqsoum
    chords: [[50, 57, 62], [48, 55, 60], [50, 57, 62], [55, 62, 67]] };
  const WAR = { bpm: 72, // D minor, calm but tense
    ost: [62, 65, 69, 65, 62, 65, 70, 65], chords: [[38, 45, 50, 53], [34, 41, 46, 50], [36, 43, 48, 52], [33, 40, 45, 49]] };
  let timer = null, nextT = 0, step = 0, phrase = [], on = false;
  function newPhrase() { // a short melody that wanders on the scale and returns home
    const p = []; let idx = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < 16; i++) { if (Math.random() < 0.38) { p.push(null); continue; } idx = Math.max(0, Math.min(TUK.scale.length - 1, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)])); p.push(TUK.scale[idx]); }
    p[15] = null; p[14] = TUK.scale[Math.random() < 0.5 ? 0 : 7]; return p;
  }
  function schedule() {
    const ahead = ctx.currentTime + 0.25;
    while (nextT < ahead) {
      const t = Math.max(nextT, ctx.currentTime + 0.02);
      if (style === 'tuk') {
        const s16 = step % 16, bar = Math.floor(step / 16) % 4;
        if (s16 === 0 && bar === 0) phrase = newPhrase();
        const r = TUK.rhythm[s16]; if (r) drum(r, t, r === 'doum' ? 0.5 : 0.22);
        if (s16 === 0) { bass(midi(TUK.chords[bar][0]), t, 0.5, 0.22); pad(TUK.chords[bar].map(midi), t, 60 / TUK.bpm * 4, 0.018); }
        if (s16 === 8) bass(midi(TUK.chords[bar][0] + 7), t, 0.4, 0.16);
        const n = phrase[s16]; if (n && bar !== 3) pluck(midi(n), t, 0.09, 0.45);
        if (bar === 3 && s16 % 2 === 0 && Math.random() < 0.5) pluck(midi(TUK.scale[Math.floor(Math.random() * 8)] + 12), t, 0.04, 0.3);
        nextT += 60 / TUK.bpm / 4;
      } else {
        const s8 = step % 8, bar = Math.floor(step / 8) % 4;
        if (s8 === 0) { pad(WAR.chords[bar].map(midi), t, 60 / WAR.bpm * 4 + 0.6, 0.02); bass(midi(WAR.chords[bar][0]), t, 1.6, 0.2); drum('taiko', t, 0.35); }
        if (s8 === 6 && bar % 2 === 1) drum('taiko', t, 0.2);
        pluck(midi(WAR.ost[s8] + (bar === 1 ? -2 : bar === 3 ? -4 : 0)), t, 0.045, 0.7);
        if (s8 % 2 === 1) drum('ka', t, 0.05);
        nextT += 60 / WAR.bpm / 2;
      }
      step++;
    }
  }
  let level = 1;
  return {
    start() { if (on) return; on = true; nextT = ctx.currentTime + 0.1; step = 0; schedule(); timer = setInterval(schedule, 90); out.gain.setTargetAtTime(0.55 * level, ctx.currentTime, 0.8); },
    stop() { if (!on) return; on = false; clearInterval(timer); timer = null; out.gain.setTargetAtTime(0, ctx.currentTime, 0.3); },
    setLevel(v) { level = v; if (on) out.gain.setTargetAtTime(0.55 * v, ctx.currentTime, 0.5); },
    get playing() { return on; },
  };
}
