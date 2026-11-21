// Suoni della bozza, tutti generati (niente campioni da scaricare) e render del loop.
import { encodeWav, peakOf } from '../../lib/wav.js';
import { DRUMS, PARTS, chordNotes, normalizeSketch, songBars } from './music.js';
import { audioRuns } from './layers.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noiseBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 1);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return b;
}

function env(g, t, peak, attack, decay, floor = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(floor, t + attack + decay);
}

// ---------------- Batteria ----------------
function softClip(ctx, amount = 2) {
  const ws = ctx.createWaveShaper();
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / 1023) * 2 - 1;
    c[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  ws.curve = c;
  return ws;
}

function noiseHit(ctx, out, noise, t, { type = 'highpass', freq = 1000, q = 0.7, peak = 0.5, decay = 0.1 }) {
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, 0.001, decay);
  n.connect(f).connect(g).connect(out);
  n.start(t, Math.random() * 0.5);
  n.stop(t + decay + 0.05);
}

const drumVoices = {
  kick(ctx, out, t, v, noise) {
    // corpo: sinusoide che scende veloce (il "pugno") e poi resta bassa
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.4);
    const g = ctx.createGain();
    env(g, t, 1.1 * v, 0.002, 0.5);
    const clip = softClip(ctx, 2.5);
    o.connect(g).connect(clip).connect(out);
    o.start(t);
    o.stop(t + 0.6);
    noiseHit(ctx, out, noise, t, { freq: 2500, peak: 0.25 * v, decay: 0.012 }); // click d'attacco
  },
  snare(ctx, out, t, v, noise) {
    noiseHit(ctx, out, noise, t, { freq: 1200, peak: 0.6 * v, decay: 0.22 });
    noiseHit(ctx, out, noise, t, { type: 'bandpass', freq: 5000, q: 0.6, peak: 0.25 * v, decay: 0.12 });
    for (const [f, a] of [
      [185, 0.45],
      [330, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 1.2, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      const g = ctx.createGain();
      env(g, t, a * v, 0.001, 0.1);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.15);
    }
  },
  clap(ctx, out, t, v, noise) {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const d of [0, 0.01, 0.021]) {
      g.gain.setValueAtTime(0.8 * v, t + d);
      g.gain.exponentialRampToValueAtTime(0.06, t + d + 0.008);
    }
    g.gain.setValueAtTime(0.7 * v, t + 0.031);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp).connect(g).connect(out);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.35);
  },
  hat(ctx, out, t, v, noise, open = false) {
    // come la TR-808: sei onde quadre "stonate" tra loro, filtrate in alto
    const mix = ctx.createGain();
    mix.gain.value = 0.18;
    const oscs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 1.7;
      o.connect(mix);
      return o;
    });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    const dec = open ? 0.38 : 0.05;
    env(g, t, (open ? 0.55 : 0.6) * v, 0.001, dec);
    mix.connect(bp).connect(hp).connect(g).connect(out);
    oscs.forEach((o) => {
      o.start(t);
      o.stop(t + dec + 0.05);
    });
    noiseHit(ctx, out, noise, t, { freq: 9000, peak: 0.08 * v, decay: dec * 0.6 });
  },
  ohat(ctx, out, t, v, noise) {
    drumVoices.hat(ctx, out, t, v, noise, true);
  },
  perc(ctx, out, t, v, noise) {
    // rimshot / legnetto
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1750, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.02);
    const g = ctx.createGain();
    env(g, t, 0.45 * v, 0.001, 0.05);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.08);
    noiseHit(ctx, out, noise, t, { type: 'bandpass', freq: 3000, q: 2, peak: 0.2 * v, decay: 0.03 });
  },
};

/** Suono caricato dall'utente (one-shot). */
function playSample(ctx, out, t, v, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = v;
  src.connect(g).connect(out);
  src.start(t);
}

// ---------------- Strumenti ----------------
function play(ctx, out, inst, midi, t, dur, vel = 1, noise) {
  const f = mtof(midi);
  const end = t + dur;
  const g = ctx.createGain();
  g.connect(out);
  const osc = (type, freq, gain = 1, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const og = ctx.createGain();
    og.gain.value = gain;
    o.connect(og);
    return { o, og };
  };
  const finish = (nodes, release) => nodes.forEach((n) => (n.start(t), n.stop(end + release + 0.05)));

  if (inst === 'piano') {
    // armonici che si spengono a velocità diverse + colpo del martelletto
    const parts = [1, 2, 3, 4, 5, 6].map((h) => {
      const o = ctx.createOscillator();
      o.frequency.value = f * h * (1 + 0.0004 * h * h); // leggera "stonatura" delle corde vere
      const og = ctx.createGain();
      const amp = (0.5 / Math.pow(h, 1.3)) * vel;
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(amp, t + 0.004);
      og.gain.exponentialRampToValueAtTime(amp * 0.25, t + 0.15 + 0.9 / h);
      og.gain.setTargetAtTime(0.0001, end, 0.09);
      o.connect(og).connect(g);
      return o;
    });
    g.gain.value = 0.8;
    finish(parts, 0.45);
    if (noise) {
      const n = ctx.createBufferSource();
      n.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(4000, f * 4);
      const ng = ctx.createGain();
      env(ng, t, 0.06 * vel, 0.001, 0.03);
      n.connect(bp).connect(ng).connect(out);
      n.start(t, Math.random() * 0.4);
      n.stop(t + 0.06);
    }
  } else if (inst === 'pluck') {
    const a = osc('sawtooth', f, 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    a.og.connect(lp).connect(g);
    env(g, t, 0.4 * vel, 0.003, Math.min(0.6, dur + 0.2));
    finish([a.o], 0.6);
  } else if (inst === 'pad') {
    const voices = [-9, 0, 9].map((d) => osc('sawtooth', f, 0.16, d));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    voices.forEach((v) => v.og.connect(lp));
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.25);
    g.gain.setTargetAtTime(0.0001, end, 0.18);
    finish(voices.map((v) => v.o), 0.9);
  } else if (inst === 'bell') {
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
    mod.connect(mg).connect(car.frequency);
    car.connect(g);
    env(g, t, 0.32 * vel, 0.002, Math.max(0.6, Math.min(2, dur + 0.8)));
    finish([car, mod], 1.6);
  } else if (inst === 'flute') {
    const a = osc('sine', f, 0.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lg = ctx.createGain();
    lg.gain.value = 6; // vibrato (cent)
    lfo.connect(lg).connect(a.o.detune);
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    n.connect(bp).connect(ng).connect(g);
    a.og.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.07);
    g.gain.setTargetAtTime(0.0001, end, 0.06);
    finish([a.o, lfo], 0.3);
    n.start(t, Math.random() * 0.4);
    n.stop(end + 0.3);
  } else {
    // 808: attacco che scende di un'ottava (il "punch"), coda lunga, un filo di distorsione
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 2, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    const pre = ctx.createGain();
    pre.gain.value = 1.4;
    const clip = softClip(ctx, 2.8);
    o.connect(pre).connect(clip).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.55 * vel, t + Math.min(dur, 0.25));
    g.gain.setTargetAtTime(0.0001, end, 0.06);
    o.start(t);
    o.stop(end + 0.4);
  }
}

/** 808 (o altro suono intonato) caricato dall'utente: intonato alla nota con la velocità di lettura. */
function playTunedSample(ctx, out, sample, midi, t, dur, vel = 1) {
  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.value = Math.pow(2, (midi - (sample.root ?? 36)) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
  src.connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.4);
}

// Riverbero semplice (per i cori): coda di rumore che si spegne
function reverb(ctx, sec = 1.8) {
  const len = Math.floor(ctx.sampleRate * sec);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 11;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 3);
    }
  }
  const cv = ctx.createConvolver();
  cv.buffer = ir;
  return cv;
}

const STEMS = ['drums', 'melody', 'chords', 'bass', 'voce'];

/**
 * Prepara la bozza come audio stereo.
 * Suono UNA volta il loop (2 giri) con ogni parte su una sua coppia di canali ("stem"):
 * il 1° giro è "pulito" (senza code da prima), il 2° ha le code che girano dalla fine all'inizio.
 * Poi monto battuta per battuta, quindi è veloce anche per un brano lungo.
 * - loop (default): esattamente `bars` battute, ripetute `loops` volte.
 * - song: tutto il brano secondo la struttura (Intro, Strofa…), con le parti accese/spente per sezione.
 * samples: suoni pronti { kick: {buffer}, bass: {buffer, root}, sample: {buffer, bars}, voce: {buffer, bars, fx} }.
 */
export async function renderSketch(raw, { sr = 44100, loops = 1, samples = {}, song = false } = {}) {
  const s = normalizeSketch(raw);
  const stepDur = 60 / s.bpm / 4;
  const barDur = 16 * stepDur;
  const loopDur = s.bars * barDur;
  const isSong = song && s.structure.length > 0;
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const nCh = STEMS.length * 2;
  const ctx = new Off(nCh, Math.ceil(loopDur * 2 * sr), sr);
  const noise = noiseBuffer(ctx);
  const merger = ctx.createChannelMerger(nCh);
  try {
    ctx.destination.channelCount = nCh;
    ctx.destination.channelInterpretation = 'discrete';
  } catch {
    /* già a posto */
  }
  merger.connect(ctx.destination);
  const bus = {};
  STEMS.forEach((id, k) => {
    const g = ctx.createGain();
    g.channelCount = 2;
    g.channelCountMode = 'explicit';
    const sp = ctx.createChannelSplitter(2);
    g.connect(sp);
    sp.connect(merger, 0, k * 2);
    sp.connect(merger, 1, k * 2 + 1);
    bus[id] = g;
  });
  // la voce coi cori va anche nel riverbero
  if (samples.voce && samples.voce.fx !== 'secca') {
    const rv = reverb(ctx);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    const dry = ctx.createGain();
    bus.voceIn = dry;
    dry.connect(bus.voce);
    dry.connect(send).connect(rv).connect(bus.voce);
  } else bus.voceIn = bus.voce;
  const swingOf = (step) => (step % 2 === 1 ? (s.swing / 100) * stepDur * 0.5 : 0);

  for (let rep = 0; rep < 2; rep++)
    for (let pb = 0; pb < s.bars; pb++) {
      const t0 = (rep * s.bars + pb) * barDur;
      for (let k = 0; k < 16; k++) {
        const step = pb * 16 + k;
        const ps = step % s.drumSteps;
        for (const d of DRUMS) {
          const v = s.drums[d.id][ps];
          if (!v) continue;
          const t = t0 + k * stepDur + swingOf(step);
          const hits = d.roll && v > 1 ? v : 1;
          for (let h = 0; h < hits; h++) {
            const th = t + (h * stepDur) / hits;
            const vv = hits > 1 ? 0.75 : 1;
            if (samples[d.id]) playSample(ctx, bus.drums, th, vv, samples[d.id].buffer);
            else drumVoices[d.id](ctx, bus.drums, th, vv, noise);
          }
        }
      }
      for (const part of ['melody', 'bass']) {
        const inst = part === 'bass' ? 'bass808' : s.instruments.melody;
        const pp = s.partPitch[part] || 0;
        for (const n of s.notes[part] || []) {
          if (n.start < pb * 16 || n.start >= (pb + 1) * 16) continue;
          const t = t0 + (n.start - pb * 16) * stepDur + swingOf(n.start);
          const dur = Math.max(0.05, n.len * stepDur * 0.98);
          if (part === 'bass' && samples.bass) playTunedSample(ctx, bus.bass, samples.bass, n.pitch + pp, t, dur, n.vel ?? 1);
          else play(ctx, bus[part], inst, n.pitch + pp, t, dur, n.vel ?? 1, noise);
        }
      }
      const deg = s.chords[pb];
      if (deg != null) for (const m of chordNotes(s.key, deg, 48)) play(ctx, bus.chords, s.instruments.chords, m + (s.partPitch.chords || 0), t0, barDur * 0.98, 0.7, noise);
    }
  // la voce è registrata sul loop: la rimetto a ogni giro
  if (samples.voce?.buffer)
    for (let rep = 0; rep < 2; rep++) {
      const src = ctx.createBufferSource();
      src.buffer = samples.voce.buffer;
      src.connect(bus.voceIn);
      src.start(rep * loopDur, 0, Math.min(loopDur, samples.voce.buffer.duration));
    }

  const out = await ctx.startRendering();
  const stem = Object.fromEntries(STEMS.map((id, k) => [id, [out.getChannelData(k * 2), out.getChannelData(Math.min(out.numberOfChannels - 1, k * 2 + 1))]]));
  const vol = (id) => (s.mix[id]?.mute ? 0 : s.mix[id]?.vol ?? 0.75);

  // il brano battuta per battuta
  const allOn = Object.fromEntries(PARTS.map((p) => [p.id, true]));
  const bars = isSong ? songBars(s) : Array.from({ length: s.bars * loops }, (_, i) => ({ sec: 0, patternBar: i % s.bars, parts: allOn }));
  const barLen = Math.round(barDur * sr);
  const loopLen = barLen * s.bars;
  const total = bars.length * barLen + (isSong ? Math.round(sr * 0.5) : 0);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const fade = Math.round(sr * 0.015);
  bars.forEach((bar, i) => {
    const dst = i * barLen;
    const prev = isSong ? bars[i - 1] : bars[i - 1] || bars[bars.length - 1];
    const next = isSong ? bars[i + 1] : bars[i + 1] || bars[0];
    for (const id of STEMS) {
      const g = vol(id);
      if (!bar.parts[id] || !g || (id === 'voce' && !samples.voce)) continue;
      // se la parte era spenta prima, prendo il 1° giro (senza code "fantasma")
      const fresh = !prev || !prev.parts[id];
      const from = (fresh && bar.patternBar === 0 ? 0 : loopLen) + bar.patternBar * barLen;
      const endsHere = !next || !next.parts[id];
      const [sl, sr2] = stem[id];
      for (let j = 0; j < barLen; j++) {
        const e = endsHere && j > barLen - fade ? (barLen - j) / fade : 1;
        L[dst + j] += sl[from + j] * g * e;
        R[dst + j] += sr2[from + j] * g * e;
      }
    }
  });
  // il sample: pezzi a tempo (nel brano conta le battute dall'inizio della sezione)
  const sm = samples.sample;
  if (sm?.buffer && vol('sample')) {
    let secStart = 0;
    const seq = bars.map((b, i) => {
      if (i > 0 && b.sec !== bars[i - 1].sec) secStart = i;
      return { on: b.parts.sample, loopBar: isSong ? i - secStart : i };
    });
    const cl = sm.buffer.getChannelData(0);
    const cr = sm.buffer.getChannelData(Math.min(1, sm.buffer.numberOfChannels - 1));
    const g = vol('sample');
    const f4 = Math.round(sr * 0.004);
    for (const r of audioRuns(seq, sm.bars)) {
      const off = r.offsetBars * barLen;
      const len = Math.min(r.lenBars * barLen, cl.length - off);
      const dst = r.bar * barLen;
      for (let j = 0; j < len; j++) {
        const e = j < f4 ? j / f4 : j > len - f4 ? (len - j) / f4 : 1;
        L[dst + j] += cl[off + j] * g * e;
        R[dst + j] += cr[off + j] * g * e;
      }
    }
  }
  const peak = Math.max(peakOf(L), peakOf(R));
  if (peak > 0.89) {
    const g = 0.89 / peak;
    for (let i = 0; i < L.length; i++) {
      L[i] *= g;
      R[i] *= g;
    }
  }
  return { L, R, sr, loopDur: isSong ? bars.length * barDur : loopDur, song: isSong };
}

export async function renderSketchWav(raw, opts) {
  const r = await renderSketch(raw, opts);
  return { blob: encodeWav([r.L, r.R], r.sr), loopDur: r.loopDur, song: r.song };
}

/** Suono di una singola nota/colpo, per sentirla quando la tocchi. */
export async function renderPreview({ drum, inst, midi, sample }) {
  const sr = 44100;
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Off(2, Math.ceil(0.8 * sr), sr);
  const noise = noiseBuffer(ctx);
  const g = ctx.createGain();
  g.gain.value = 0.8;
  g.connect(ctx.destination);
  if (sample && drum) playSample(ctx, g, 0.01, 1, sample.buffer);
  else if (sample) playTunedSample(ctx, g, sample, midi, 0.01, 0.5, 1);
  else if (drum) drumVoices[drum](ctx, g, 0.01, 1, noise);
  else play(ctx, g, inst, midi, 0.01, 0.35, 1, noise);
  const out = await ctx.startRendering();
  return encodeWav([out.getChannelData(0), out.getChannelData(1)], sr);
}
